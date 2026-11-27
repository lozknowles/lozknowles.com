import asyncio
import json

import httpx
import pytest

from app.codex_usage import CodexAccountMismatch, parse_codex_response
from app.main import create_app
from app.openai_usage import Account, OpenAIUsageCollector, load_accounts

from .conftest import login


def test_private_routes_require_existing_session_and_csrf(client):
    for path in ('/openai-usage', '/assets/openai-usage.js', '/assets/openai-usage.css', '/api/openai-usage'):
        assert client.get(path).status_code == 303
    assert client.post('/api/openai-usage/refresh').status_code == 303
    assert login(client).status_code == 303
    page = client.get('/openai-usage')
    assert page.status_code == 200
    assert 'OpenAI <em>usage.</em>' in page.text
    assert client.get('/api/openai-usage').json()['accounts'][0]['api_spend_usd']['value'] is None
    assert client.post('/api/openai-usage/refresh').status_code == 403
    token = page.text.split('name="csrf-token" content="')[1].split('"')[0]
    assert client.post('/api/openai-usage/refresh', headers={'X-CSRF-Token': token}).status_code == 200
    assert 'no-store' in page.headers['cache-control']


def test_account_config_is_bounded_and_has_no_inline_secrets(tmp_path):
    path = tmp_path / 'accounts.json'
    path.write_text(json.dumps([{'name': 'Primary', 'products': ['chatgpt', 'codex', 'api'],
                                 'subscription': 'Plus', 'admin_key_env': 'OPENAI_ADMIN_KEY_ONE',
                                 'organization_id': 'org-one'}]))
    accounts = load_accounts(path)
    assert len(accounts) == 1 and accounts[0].organization_id == 'org-one'
    path.write_text(json.dumps([{'name': 'x', 'products': ['api'], 'admin_key_env': 'SECRET'}]))
    with pytest.raises(ValueError):
        load_accounts(path)


def test_costs_tokens_pagination_cache_and_missing_data(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'test-only')
    calls = []

    def handler(request):
        assert request.headers['authorization'] == 'Bearer test-only'
        calls.append(str(request.url))
        if request.url.path.endswith('/costs'):
            if 'page=' in str(request.url):
                return httpx.Response(200, json={'data': [{'results': [{'amount': {'value': 1.25}}]}], 'has_more': False})
            return httpx.Response(200, json={'data': [{'results': [{'amount': {'value': 0.75}}]}], 'has_more': True, 'next_page': 'p2'})
        return httpx.Response(200, json={'data': [{'results': [{'input_tokens': 100, 'output_tokens': 20}]}], 'has_more': False})

    collector = OpenAIUsageCollector((Account('Primary', ('chatgpt', 'codex', 'api'), 'Plus',
                                             'OPENAI_ADMIN_KEY_ONE', 'org-one'),),
                                     httpx.MockTransport(handler))
    first = asyncio.run(collector.snapshot())
    assert first['accounts'][0]['api_spend_usd']['value'] == 2
    assert first['accounts'][0]['api_tokens']['value'] == {'input_tokens': 100, 'output_tokens': 20}
    assert first['accounts'][0]['codex']['value'] is None
    assert first['combined_api_spend_usd'] == 2
    assert first['accounts'][1]['configured'] is False
    assert len(calls) == 3
    asyncio.run(collector.snapshot(force=True))
    assert len(calls) == 3


def test_partial_api_failure_does_not_become_zero(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'test-only')

    def handler(request):
        if request.url.path.endswith('/costs'):
            return httpx.Response(403)
        return httpx.Response(200, json={'data': [{'results': [{'input_tokens': 0, 'output_tokens': 0}]}]})

    collector = OpenAIUsageCollector((Account('Primary', ('api',), None,
                                             'OPENAI_ADMIN_KEY_ONE', 'org-one'),),
                                     httpx.MockTransport(handler))
    result = asyncio.run(collector.snapshot())
    assert result['accounts'][0]['api_spend_usd']['value'] is None
    assert result['accounts'][0]['api_tokens']['value']['input_tokens'] == 0
    assert result['combined_api_spend_usd'] is None


def test_invalid_optional_config_keeps_private_hub_running(app, client, tmp_path):
    from dataclasses import replace

    invalid = tmp_path / 'bad-accounts.json'
    invalid.write_text('{invalid')
    safe = create_app(replace(app.state.settings, openai_usage_accounts_file=invalid))
    from fastapi.testclient import TestClient

    with TestClient(safe, follow_redirects=False) as browser:
        assert browser.get('/').status_code == 303
        assert login(browser).status_code == 303
        assert browser.get('/').status_code == 200
        data = browser.get('/api/openai-usage').json()
        assert data['configuration_error'] is True
        assert data['accounts'][0]['api_spend_usd']['value'] is None


def test_nonfinite_cost_is_unavailable_while_other_account_remains_healthy(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'bad-test-key')
    monkeypatch.setenv('OPENAI_ADMIN_KEY_TWO', 'good-test-key')

    def handler(request):
        if request.url.path.endswith('/costs'):
            if request.headers['authorization'] == 'Bearer bad-test-key':
                return httpx.Response(200, content=b'{"data":[{"results":[{"amount":{"value":1e400,"currency":"usd"}}]}]}')
            return httpx.Response(200, json={'data': [{'results': [{'amount': {'value': 0, 'currency': 'usd'}}]}]})
        return httpx.Response(200, json={'data': [{'results': [{'input_tokens': 0, 'output_tokens': 0}]}]})

    accounts = (Account('Bad', ('api',), admin_key_env='OPENAI_ADMIN_KEY_ONE', organization_id='org-one'),
                Account('Good', ('api',), admin_key_env='OPENAI_ADMIN_KEY_TWO', organization_id='org-two'))
    result = asyncio.run(OpenAIUsageCollector(accounts, httpx.MockTransport(handler)).snapshot())
    assert result['accounts'][0]['api_spend_usd']['value'] is None
    assert result['accounts'][1]['api_spend_usd']['value'] == 0
    assert result['combined_api_spend_usd'] is None
    json.dumps(result, allow_nan=False)


def test_token_rate_limit_cooldown_applies_to_manual_refresh(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'test-only')
    requests = []

    def handler(request):
        requests.append(request.url.path)
        if request.url.path.endswith('/usage/completions'):
            return httpx.Response(429, headers={'Retry-After': '600'})
        return httpx.Response(200, json={'data': [{'results': [{'amount': {'value': 1, 'currency': 'usd'}}]}]})

    collector = OpenAIUsageCollector((Account('API', ('api',), admin_key_env='OPENAI_ADMIN_KEY_ONE',
                                             organization_id='org-one'),), httpx.MockTransport(handler))
    first = asyncio.run(collector.snapshot())
    assert first['accounts'][0]['api_tokens']['value'] is None
    collector._last_fetch -= 121
    asyncio.run(collector.snapshot(force=True))
    assert requests.count('/v1/organization/usage/completions') == 1
    assert requests.count('/v1/organization/costs') == 2


def test_codex_window_parser_uses_documented_durations_and_account_binding():
    account = {'account': {'type': 'chatgpt', 'planType': 'pro'}}
    limits = {'accountId': 'expected-id', 'rateLimitsByLimitId': {'codex': {
        'primary': {'usedPercent': 25, 'windowDurationMins': 300, 'resetsAt': 1792296958},
        'secondary': {'usedPercent': 50, 'windowDurationMins': 10080, 'resetsAt': 1792296958},
    }}}
    parsed = parse_codex_response(account, limits, 'expected-id')
    assert parsed['value']['five_hour']['remaining_percent'] == 75
    assert parsed['value']['weekly']['remaining_percent'] == 50
    assert parsed['value']['other_windows'] == []
    with pytest.raises(CodexAccountMismatch):
        parse_codex_response(account, limits, 'different-id')
    mixed = {**limits, 'rateLimitsByLimitId': {'other-model': limits['rateLimitsByLimitId']['codex']},
             'rateLimits': limits['rateLimitsByLimitId']['codex']}
    with pytest.raises(TypeError):
        parse_codex_response(account, mixed, 'expected-id')


def test_codex_nonstandard_window_is_available_without_inventing_five_hour_or_weekly():
    account = {'account': {'type': 'chatgpt', 'planType': 'free'}}
    limits = {'accountId': 'free-id', 'rateLimitsByLimitId': {'codex': {
        'primary': {'usedPercent': 100, 'windowDurationMins': 43200, 'resetsAt': 1792296958},
        'secondary': {'usedPercent': 25, 'windowDurationMins': True, 'resetsAt': 1792296958},
    }}}
    parsed = parse_codex_response(account, limits, 'free-id')
    assert parsed['status'] == 'current'
    assert parsed['value']['five_hour'] is None
    assert parsed['value']['weekly'] is None
    assert parsed['value']['other_windows'] == [{
        'duration_minutes': 43200, 'remaining_percent': 0,
        'resets_at': '2026-10-18T04:15:58+00:00',
    }]
    with pytest.raises(ValueError):
        parse_codex_response(account, limits, 'wrong-id')


def test_codex_account_mismatch_has_safe_specific_status(monkeypatch):
    async def wrong_account(*_args):
        raise CodexAccountMismatch('Codex account mismatch')

    monkeypatch.setattr('app.openai_usage.read_codex_usage', wrong_account)
    account = Account('Expected', ('codex',), codex_account_id='expected-id')
    result = asyncio.run(OpenAIUsageCollector((account,)).snapshot())
    codex = result['accounts'][0]['codex']
    assert codex['value'] is None
    assert codex['reason'] == 'Signed-in Codex account does not match configured account'
    assert 'expected-id' not in json.dumps(result)


def test_combined_spend_counts_same_organization_once(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'test-only')

    def handler(request):
        result = ({'amount': {'value': 3.5, 'currency': 'usd'}}
                  if request.url.path.endswith('/costs')
                  else {'input_tokens': 0, 'output_tokens': 0})
        return httpx.Response(200, json={'data': [{'results': [result]}]})

    account = Account('API', ('api',), admin_key_env='OPENAI_ADMIN_KEY_ONE',
                      organization_id='org-shared')
    result = asyncio.run(OpenAIUsageCollector((account, account), httpx.MockTransport(handler)).snapshot())
    assert result['accounts'][0]['api_spend_usd']['value'] == 3.5
    assert result['accounts'][1]['api_spend_usd']['value'] == 3.5
    assert result['combined_api_spend_usd'] == 3.5


def test_concurrent_refreshes_share_one_collection(monkeypatch):
    monkeypatch.setenv('OPENAI_ADMIN_KEY_ONE', 'test-only')
    calls = []

    def handler(request):
        calls.append(request.url.path)
        result = ({'amount': {'value': 1, 'currency': 'usd'}}
                  if request.url.path.endswith('/costs')
                  else {'input_tokens': 1, 'output_tokens': 1})
        return httpx.Response(200, json={'data': [{'results': [result]}]})

    collector = OpenAIUsageCollector((Account('API', ('api',), admin_key_env='OPENAI_ADMIN_KEY_ONE',
                                             organization_id='org-one'),), httpx.MockTransport(handler))

    async def run_together():
        return await asyncio.gather(*(collector.snapshot(force=True) for _ in range(5)))

    results = asyncio.run(run_together())
    assert all(result['combined_api_spend_usd'] == 1 for result in results)
    assert len(calls) == 2
