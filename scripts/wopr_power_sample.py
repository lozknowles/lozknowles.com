#!/usr/bin/env python3
"""Read WOPR's power locally. Print only a bounded public sample."""
import json
import math
import time
from pathlib import Path

import tinytuya

CONFIG = Path('/home/loz/.config/wopr-power')


def read_power():
    device = json.loads((CONFIG / 'device.json').read_text())
    key = (CONFIG / 'local-key').read_text().strip()
    plug = tinytuya.OutletDevice(device['id'], device['ip'], key)
    plug.set_version(3.4)
    plug.set_socketPersistent(False)
    plug.set_socketTimeout(3)
    status = plug.status()
    dps = status.get('dps', {})
    raw = dps.get('19', dps.get(19))
    if type(raw) not in (int, float) or not math.isfinite(raw):
        raise ValueError('No power data point')
    watts = raw / 10
    if not 0 <= watts <= 4000:
        raise ValueError('Power outside expected range')
    return {'watts': round(watts, 1), 'observed_at': int(time.time())}


if __name__ == '__main__':
    print(json.dumps(read_power(), separators=(',', ':')))
