"""Combine local source WAVs into a metadata-free audio sprite and runtime timings."""
import argparse
import json
import subprocess
import wave
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
lines = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./assets/cheeky-lines.js')))"], cwd=root))
cursor = 0
clips = {}
with wave.open(str(args.source / 'george-source.wav'), 'wb') as out:
    out.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
    for key in lines:
        with wave.open(str(args.source / f'{key}.wav'), 'rb') as clip:
            assert (clip.getnchannels(), clip.getsampwidth(), clip.getframerate()) == (1, 2, 24000)
            duration = clip.getnframes() / 24000
            clips[key] = [round(cursor, 6), round(duration, 6)]
            out.writeframes(clip.readframes(clip.getnframes()))
            out.writeframes(bytes(12000))
            cursor += duration + .25
subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(args.source/'george-source.wav'), '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '64k', '-write_xing', '1', '-id3v2_version', '0', str(root/'assets/cheeky-george.mp3')], check=True)
(root/'assets/cheeky-clips.js').write_text('window.CheekyClips = '+json.dumps(clips, separators=(',', ':'))+';\n', encoding='utf-8')
print(f'Packaged {len(clips)} matching clips; {cursor:.2f}s including separators.')
