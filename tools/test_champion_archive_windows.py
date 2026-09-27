"""Networkless tests for 288 complete verified windows and fail-closed archive conversion."""
import csv
import datetime as dt
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import champion_archive_windows as mod

DAY = '2026-09-25'
START = int(dt.datetime.fromisoformat(DAY).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)


def archive_at(folder: pathlib.Path, gap=False):
    path = folder / f'BTCUSDT-aggTrades-{DAY}.zip'
    body = io.StringIO()
    writer = csv.writer(body)
    writer.writerow(['agg_trade_id', 'price', 'quantity', 'first_trade_id', 'last_trade_id', 'transact_time', 'is_buyer_maker'])
    for i in range(288):
        trade_id = i + 1 + (1 if gap and i >= 100 else 0)
        when = START + i * 300_000 + (299_000 if i == 287 else 1_000)
        writer.writerow([trade_id, '100.0', '2', trade_id, trade_id, when, 'true'])
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(path.stem + '.csv', body.getvalue())
    return path


class WindowsTest(unittest.TestCase):
    def test_all_288_windows_and_checksum_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            folder = pathlib.Path(root)
            path = archive_at(folder)
            with patch.object(mod, 'CACHE', folder), patch.object(mod, 'download_verified', return_value=path):
                meta = mod.convert_day('BTCUSDT', DAY)
                self.assertEqual(meta['windows'], 288)
                self.assertEqual(meta['trades'], 288)
                self.assertEqual(len(meta['sha256']), 64)
                self.assertEqual(json.loads((folder / f'BTCUSDT-5m-{DAY}.meta.json').read_text()), meta)

    def test_gap_in_unobserved_window_rejects_entire_day_and_removes_partial_output(self):
        with tempfile.TemporaryDirectory() as root:
            folder = pathlib.Path(root)
            path = archive_at(folder, gap=True)
            with patch.object(mod, 'CACHE', folder), patch.object(mod, 'download_verified', return_value=path):
                with self.assertRaisesRegex(ValueError, 'gap ID'):
                    mod.convert_day('BTCUSDT', DAY)
                self.assertFalse((folder / f'BTCUSDT-5m-{DAY}.jsonl.gz').exists())
                self.assertFalse((folder / f'BTCUSDT-5m-{DAY}.meta.json').exists())


if __name__ == '__main__':
    unittest.main()
