"""Optional read-only Codex app-server adapter using existing local sign-in."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from datetime import UTC, datetime
from pathlib import Path


def _window(bucket: dict, minutes: int) -> dict | None:
    for item in (bucket.get('primary'), bucket.get('secondary')):
        if not isinstance(item, dict) or item.get('windowDurationMins') != minutes:
            continue
        used = item.get('usedPercent')
        reset = item.get('resetsAt')
        if not isinstance(used, (int, float)) or isinstance(used, bool) or not 0 <= used <= 100:
            continue
        if not isinstance(reset, (int, float)) or isinstance(reset, bool) or reset <= 0:
            continue
        try:
            reset_at = datetime.fromtimestamp(reset, UTC).isoformat()
        except (OverflowError, OSError, ValueError):
            continue
        return {'remaining_percent': round(100 - used, 1), 'resets_at': reset_at}
    return None


def parse_codex_response(account: dict, limits: dict, expected_id: str) -> dict:
    if limits.get('accountId') != expected_id:
        raise ValueError('Codex account mismatch')
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
    five_hour = _window(bucket, 300)
    weekly = _window(bucket, 10080)
    if five_hour is None and weekly is None:
        raise ValueError('Codex quota windows unavailable')
    plan = info.get('planType')
    return {'value': {'five_hour': five_hour, 'weekly': weekly}, 'status': 'current',
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
