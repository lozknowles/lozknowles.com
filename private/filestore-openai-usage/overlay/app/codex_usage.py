"""Optional read-only Codex app-server adapter using existing local sign-in."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from datetime import UTC, datetime
from pathlib import Path


class CodexAccountMismatch(ValueError):
    """The signed-in profile is not the configured account."""


def _window(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    minutes = item.get('windowDurationMins')
    used = item.get('usedPercent')
    reset = item.get('resetsAt')
    if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes <= 0:
        return None
    if not isinstance(used, (int, float)) or isinstance(used, bool) or not 0 <= used <= 100:
        return None
    if not isinstance(reset, (int, float)) or isinstance(reset, bool) or reset <= 0:
        return None
    try:
        reset_at = datetime.fromtimestamp(reset, UTC).isoformat()
    except (OverflowError, OSError, ValueError):
        return None
    return {'duration_minutes': minutes, 'remaining_percent': round(100 - used, 1),
            'resets_at': reset_at}


def parse_codex_response(account: dict, limits: dict, expected_id: str) -> dict:
    if limits.get('accountId') != expected_id:
        raise CodexAccountMismatch('Codex account mismatch')
    info = account.get('account') or {}
    if not isinstance(info, dict) or info.get('type') != 'chatgpt':
        raise ValueError('Codex is not signed in with ChatGPT')
    buckets = limits.get('rateLimitsByLimitId')
    if buckets is not None:
        bucket = buckets.get('codex') if isinstance(buckets, dict) else None
    else:
        bucket = limits.get('rateLimits')
        if isinstance(bucket, dict) and bucket.get('limitId') not in (None, 'codex'):
            bucket = None
    if not isinstance(bucket, dict):
        raise TypeError('Codex rate limit unavailable')
    windows = {}
    for item in (bucket.get('primary'), bucket.get('secondary')):
        window = _window(item)
        if window is not None:
            windows.setdefault(window['duration_minutes'], window)
    if not windows:
        raise ValueError('Codex quota windows unavailable')
    five_hour = windows.get(300)
    weekly = windows.get(10080)
    other_windows = [window for duration, window in sorted(windows.items())
                     if duration not in (300, 10080)]
    plan = info.get('planType')
    return {'value': {'five_hour': five_hour, 'weekly': weekly,
                      'other_windows': other_windows}, 'status': 'current',
            'source': 'Codex app-server', 'plan': plan if isinstance(plan, str) else None}


async def read_codex_usage(expected_id: str, codex_home: Path | None) -> dict:
    executable = os.environ.get('FILESTORE_CODEX_BIN') or shutil.which('codex')
    if not executable:
        raise OSError('Codex CLI unavailable')
    environment = os.environ.copy()
    if codex_home is not None:
        if not codex_home.is_dir():
            raise OSError('Codex profile unavailable')
        environment['CODEX_HOME'] = str(codex_home)
    process = await asyncio.create_subprocess_exec(
        executable, 'app-server', '--stdio', stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env=environment, limit=131072,
    )
    requests = (
        {'method': 'initialize', 'id': 1, 'params': {'clientInfo': {
            'name': 'loz_private_usage', 'title': 'Loz Private Usage', 'version': '1.0.0'}}},
        {'method': 'initialized', 'params': {}},
        {'method': 'account/read', 'id': 2, 'params': {'refreshToken': False}},
        {'method': 'account/rateLimits/read', 'id': 3},
    )
    try:
        process.stdin.write((''.join(json.dumps(item) + '\n' for item in requests)).encode())
        await process.stdin.drain()
        responses = {}
        async with asyncio.timeout(12):
            for _ in range(80):
                line = await process.stdout.readline()
                if not line:
                    break
                message = json.loads(line)
                if message.get('id') in (2, 3):
                    if 'error' in message:
                        raise ValueError('Codex account request failed')
                    responses[message['id']] = message.get('result')
                if 2 in responses and 3 in responses:
                    if not isinstance(responses[2], dict) or not isinstance(responses[3], dict):
                        raise ValueError('Invalid Codex response')
                    return parse_codex_response(responses[2], responses[3], expected_id)
        raise ValueError('Codex account request incomplete')
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=3)
            except TimeoutError:
                process.kill()
                await process.wait()
