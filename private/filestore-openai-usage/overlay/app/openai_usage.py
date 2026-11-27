"""Read-only OpenAI usage collection for the existing private hub."""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

import httpx

from .codex_usage import CodexAccountMismatch, read_codex_usage

BASE_URL = 'https://api.openai.com/v1/organization'
ENV_NAME = re.compile(r'^OPENAI_ADMIN_KEY_[A-Z0-9_]+$')
PRODUCTS = {'chatgpt', 'codex', 'api'}


@dataclass(frozen=True)
class Account:
    name: str
    products: tuple[str, ...]
    subscription: str | None = None
    admin_key_env: str | None = None
    organization_id: str | None = None
    codex_account_id: str | None = None
    codex_home: Path | None = None


def load_accounts(path: Path | None) -> tuple[Account, ...]:
    if path is None or not path.is_file():
        return ()
    if path.is_symlink():
        raise ValueError('OpenAI account config must be a regular file')
    raw = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(raw, list) or len(raw) > 4:
        raise ValueError('Configure no more than four OpenAI accounts')
    accounts = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get('name'), str):
            raise TypeError('Invalid OpenAI account entry')
        name = item['name'].strip()
        products = item.get('products', [])
        subscription = item.get('subscription')
        key_env = item.get('admin_key_env')
        org_id = item.get('organization_id')
        codex_id = item.get('codex_account_id')
        codex_home = item.get('codex_home')
        if (not 1 <= len(name) <= 80 or not isinstance(products, list)
                or not products or len(products) != len(set(products))
                or not set(products) <= PRODUCTS
                or (subscription is not None and (not isinstance(subscription, str) or len(subscription) > 80))
                or (key_env is not None and (not isinstance(key_env, str) or not ENV_NAME.fullmatch(key_env)))
                or (org_id is not None and (not isinstance(org_id, str) or not re.fullmatch(r'org-[A-Za-z0-9_-]+', org_id)))):
            raise ValueError('Invalid OpenAI account entry')
        if (codex_id is not None and (not isinstance(codex_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', codex_id))
                or (codex_home is not None and (not isinstance(codex_home, str) or not Path(codex_home).is_absolute()))
                or (codex_id or codex_home) and 'codex' not in products):
            raise ValueError('Invalid Codex account configuration')
        if key_env and 'api' not in products:
            raise ValueError('Admin key requires API product')
        accounts.append(Account(name, tuple(products), subscription, key_env, org_id,
                                codex_id, Path(codex_home) if codex_home else None))
    return tuple(accounts)


def unavailable(reason: str) -> dict:
    return {'value': None, 'status': 'unavailable', 'reason': reason}


def retry_delay(value: str) -> int:
    try:
        seconds = int(value)
    except ValueError:
        try:
            until = parsedate_to_datetime(value)
            seconds = int(until.timestamp() - time.time()) + 1
        except (TypeError, ValueError, OverflowError, IndexError):
            seconds = 120
    return min(86400, max(120, seconds))


async def fetch_total(client: httpx.AsyncClient, path: str, key: str, start: int,
                      end: int, organization_id: str | None, fields: tuple[str, ...]) -> dict:
    headers = {'Authorization': f'Bearer {key}', 'Accept': 'application/json'}
    if organization_id:
        headers['OpenAI-Organization'] = organization_id
    totals = {field: 0 for field in fields}
    page = None
    seen = set()
    for _ in range(12):
        params = {'start_time': start, 'end_time': end, 'bucket_width': '1d', 'limit': 31}
        if page:
            params['page'] = page
        response = await client.get(BASE_URL + path, headers=headers, params=params)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict) or not isinstance(body.get('data'), list):
            raise TypeError('Invalid usage response')
        for bucket in body['data']:
            if not isinstance(bucket, dict) or not isinstance(bucket.get('results'), list):
                raise TypeError('Invalid usage bucket')
            for result in bucket['results']:
                if not isinstance(result, dict):
                    raise TypeError('Invalid usage result')
                for field in fields:
                    if field == 'amount' and result.get('amount', {}).get('currency') not in ('usd', None):
                        raise ValueError('Unsupported cost currency')
                    value = result.get('amount', {}).get('value') if field == 'amount' else result.get(field)
                    if (not isinstance(value, (int, float)) or isinstance(value, bool)
                            or not math.isfinite(value)):
                        raise TypeError('Invalid usage value')
                    if field != 'amount' and (not isinstance(value, int) or value < 0):
                        raise TypeError('Invalid token count')
                    totals[field] += value
        if not body.get('has_more'):
            if any(not math.isfinite(value) for value in totals.values()):
                raise ValueError('Invalid usage total')
            return totals
        page = body.get('next_page')
        if not isinstance(page, str) or not page or page in seen:
            raise ValueError('Invalid usage pagination')
        seen.add(page)
    raise ValueError('Usage pagination exceeded safety bound')


class OpenAIUsageCollector:
    def __init__(self, accounts: tuple[Account, ...], transport: httpx.AsyncBaseTransport | None = None,
                 configuration_error: bool = False):
        self.accounts = accounts
        self.transport = transport
        self.configuration_error = configuration_error
        self._lock = asyncio.Lock()
        self._cache: dict | None = None
        self._next_fetch = 0.0
        self._last_fetch = 0.0
        self._min_interval = 60.0
        self._operation_cooldown: dict[tuple[int, str], float] = {}

    async def snapshot(self, force: bool = False) -> dict:
        async with self._lock:
            now = time.monotonic()
            if self._cache is not None and now < self._next_fetch and (not force or now - self._last_fetch < self._min_interval):
                return self._cache
            self._last_fetch = now
            # A manual refresh can bypass the five-minute cache once per minute.
            self._next_fetch = now + 60
            try:
                self._cache = await self._collect()
                self._next_fetch = time.monotonic() + 300
                self._min_interval = (120.0 if any(
                    'api' in row['products'] and (row['api_spend_usd']['value'] is None
                                                  or row['api_tokens']['value'] is None)
                    for row in self._cache['accounts'] if row['configured']) else 60.0)
            except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError, OSError):
                # Keep upstream failures and previous values separate.
                self._cache = {'accounts': [], 'combined_api_spend_usd': None,
                               'combined_status': 'unavailable', 'updated_at': None,
                               'reason': 'Usage collection temporarily unavailable'}
                self._next_fetch = time.monotonic() + 120
                self._min_interval = 120.0
            return self._cache

    async def _collect(self) -> dict:
        now = datetime.now(UTC)
        start = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
        end = int(now.timestamp())
        period = {'start': datetime.fromtimestamp(start, UTC).isoformat(), 'end': now.isoformat()}
        async with httpx.AsyncClient(timeout=httpx.Timeout(8), transport=self.transport,
                                     follow_redirects=False) as client:
            rows = await asyncio.gather(*(self._account(client, i, a, start, end, period)
                                          for i, a in enumerate(self.accounts)))
        for index in range(len(rows), 4):
            rows.append({'slot': index + 1, 'name': f'Account {index + 1}', 'products': [],
                         'subscription': None, 'configured': False,
                         'codex': unavailable('Account not configured'),
                         'chatgpt': unavailable('Account not configured'),
                         'api_credits_usd': unavailable('Account not configured'),
                         'api_spend_usd': unavailable('Account not configured'),
                         'api_tokens': unavailable('Account not configured')})
        unique_scopes = {}
        complete = True
        for account, row in zip(self.accounts, rows):
            if 'api' not in account.products:
                continue
            metric = row['api_spend_usd']
            if metric['value'] is None or not account.organization_id:
                complete = False
                continue
            previous = unique_scopes.get(account.organization_id)
            if previous is not None and previous != metric['value']:
                complete = False
            unique_scopes[account.organization_id] = metric['value']
        combined = round(sum(unique_scopes.values()), 2) if complete and unique_scopes else None
        return {'accounts': rows, 'combined_api_spend_usd': combined,
                'combined_status': 'complete' if combined is not None else 'unavailable',
                'combined_reason': None if combined is not None else 'All API organizations need an ID and successful costs response',
                'period': period, 'updated_at': now.isoformat(),
                'configuration_error': self.configuration_error}

    async def _account(self, client: httpx.AsyncClient, index: int, account: Account, start: int,
                       end: int, period: dict) -> dict:
        row = {'name': account.name, 'products': list(account.products),
               'subscription': account.subscription, 'configured': True,
               'codex': unavailable('Codex account binding not configured'),
               'chatgpt': unavailable('No supported personal ChatGPT allowance API'),
               'api_credits_usd': unavailable('No documented prepaid credit balance endpoint'),
               'api_spend_usd': unavailable('API reporting not configured'),
               'api_tokens': unavailable('API reporting not configured')}
        if 'codex' in account.products and account.codex_account_id:
            try:
                row['codex'] = await read_codex_usage(account.codex_account_id, account.codex_home)
                if not row['subscription'] and row['codex']['plan']:
                    row['subscription'] = row['codex']['plan']
            except CodexAccountMismatch:
                row['codex'] = unavailable('Signed-in Codex account does not match configured account')
            except (OSError, ValueError, TypeError, KeyError, TimeoutError, RuntimeError):
                row['codex'] = unavailable('Codex profile or rate limits unavailable')
        if 'api' not in account.products:
            return row
        key = os.environ.get(account.admin_key_env or '', '')
        if not key:
            row['api_spend_usd'] = unavailable('Admin key not configured')
            row['api_tokens'] = unavailable('Admin key not configured')
            return row
        for field, path, names in (
            ('api_spend_usd', '/costs', ('amount',)),
            ('api_tokens', '/usage/completions', ('input_tokens', 'output_tokens')),
        ):
            if time.monotonic() < self._operation_cooldown.get((index, field), 0):
                row[field] = unavailable('OpenAI reporting rate limited')
                continue
            try:
                totals = await fetch_total(client, path, key, start, end, account.organization_id, names)
                value = round(totals['amount'], 2) if field == 'api_spend_usd' else totals
                row[field] = {'value': value, 'status': 'current', 'source': 'OpenAI organization API',
                              'period': period}
            except httpx.HTTPStatusError as error:
                if error.response.status_code == 429:
                    delay = retry_delay(error.response.headers.get('Retry-After', ''))
                    self._operation_cooldown[(index, field)] = time.monotonic() + delay
                row[field] = unavailable('OpenAI reporting request failed or access denied')
            except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
                row[field] = unavailable('OpenAI reporting request failed or access denied')
        return row
