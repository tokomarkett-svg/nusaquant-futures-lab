"""Synthetic tests for archive coverage and fail-closed cursor validation (no network)."""
import csv
import datetime as dt
import pathlib
import tempfile
import unittest
import zipfile

from champion_archive_probe import extract

DAY = '2026-09-25'
START = int(dt.datetime.fromisoformat(DAY).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)


class ArchiveProbeTest(unittest.TestCase):
    def make_archive(self, root: pathlib.Path, ids=(1, 2, 3)):
        path = root / 'BTCUSDT-aggTrades-2026-09-25.zip'
        rows = [
            [ids[0], '100', '1', 1, 1, START + 100, 'true'],
            [ids[1], '101', '2', 2, 2, START + 12 * 3_600_000 + 2000, 'false'],
            [ids[2], '100', '1', 3, 3, START + 86_400_000 - 1000, 'true'],
        ]
        import io
        body = io.StringIO()
        writer = csv.writer(body)
        writer.writerow(['agg_trade_id', 'price', 'quantity', 'first_trade_id', 'last_trade_id', 'transact_time', 'is_buyer_maker'])
        writer.writerows(rows)
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(path.stem + '.csv', body.getvalue())
        return path

    def test_full_day_proves_window_and_taker_side(self):
        with tempfile.TemporaryDirectory() as folder:
            result = extract(self.make_archive(pathlib.Path(folder)), DAY,
                             START + 12 * 3_600_000, START + 12 * 3_600_000 + 300_000, 10)
            self.assertTrue(result['complete'])
            self.assertEqual(result['dayTradesChecked'], 3)
            self.assertEqual(result['trades'], [
                {'id': 2, 'time': START + 12 * 3_600_000 + 2000,
                 'price': 101.0, 'quantity': 2.0, 'buyerIsMaker': False}])

    def test_gap_rejected_even_outside_selected_window(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = self.make_archive(pathlib.Path(folder), ids=(1, 2, 5))
            with self.assertRaisesRegex(ValueError, 'gap ID'):
                extract(archive, DAY, START + 12 * 3_600_000, START + 12 * 3_600_000 + 300_000, 10)

    def test_wrong_day_window_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = self.make_archive(pathlib.Path(folder))
            with self.assertRaisesRegex(ValueError, 'satu hari'):
                extract(archive, DAY, START + 86_400_000 - 60_000, START + 86_400_000 + 1000, 10)


if __name__ == '__main__':
    unittest.main()
