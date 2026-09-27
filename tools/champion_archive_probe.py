#!/usr/bin/env python3
"""Read-only research extraction of a *verified* Binance USD-M aggTrades day.

Only downloads a public zip and CHECKSUM. Scans the WHOLE day to verify aggregate
trade IDs and time coverage before exporting a bounded 5/15-minute window.
No key, order, Telegram, or running service. Large zip lives in .cache (not git).
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'champion-archive'
HOST = 'https://data.binance.vision/data/futures/um/daily/aggTrades'


def download_verified(symbol: str, day: str) -> pathlib.Path:
    filename = f'{symbol}-aggTrades-{day}.zip'
    url = f'{HOST}/{symbol}/{filename}'
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / filename
    with urllib.request.urlopen(url + '.CHECKSUM', timeout=20) as response:
        checksum_line = response.read(200).decode('utf-8').strip().split()
    if len(checksum_line) != 2 or checksum_line[1] != filename or not re.fullmatch('[0-9a-f]{64}', checksum_line[0]):
        raise ValueError('CHECKSUM resmi invalid')
    expected = checksum_line[0]
    for attempt in range(2):
        if not path.exists():
            with urllib.request.urlopen(url, timeout=40) as response, path.open('wb') as file:
                while chunk := response.read(1024 * 1024):
                    file.write(chunk)
        digest = hashlib.sha256()
        with path.open('rb') as file:
            while chunk := file.read(1024 * 1024):
                digest.update(chunk)
        if digest.hexdigest() == expected:
            return path
        path.unlink(missing_ok=True)
    raise ValueError('SHA256 arsip tidak cocok dengan Binance; data DITOLAK')


def extract(path: pathlib.Path, day: str, start: int, end: int, max_rows: int) -> dict:
    day_start = int(dt.datetime.fromisoformat(day).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    if not (day_start <= start < end <= day_start + 86_400_000):
        raise ValueError('window harus berada pada satu hari UTC arsip')
    rows = []
    first_time = last_time = previous_id = None
    total = 0
    with zipfile.ZipFile(path) as z:
        if z.namelist() != [path.stem + '.csv']:
            raise ValueError('arsip memiliki isi CSV yang tidak diharapkan')
        with z.open(z.namelist()[0]) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf8'))
            required = {'agg_trade_id', 'price', 'quantity', 'transact_time', 'is_buyer_maker'}
            if not required.issubset(reader.fieldnames or []):
                raise ValueError('kolom sumber trade Binance berubah; data DITOLAK')
            for item in reader:
                ident = int(item['agg_trade_id'])
                when = int(item['transact_time'])
                price = float(item['price'])
                qty = float(item['quantity'])
                maker = item['is_buyer_maker']
                if (previous_id is not None and ident != previous_id + 1) or \
                        (last_time is not None and when < last_time) or \
                        not (day_start <= when < day_start + 86_400_000) or \
                        price <= 0 or qty <= 0 or maker not in ('true', 'false'):
                    raise ValueError('gap ID, urutan waktu, angka atau sisi trade invalid; seluruh window DITOLAK')
                total += 1
                first_time = first_time if first_time is not None else when
                last_time = when
                previous_id = ident
                if start <= when < end:
                    rows.append({'id': ident, 'time': when, 'price': price,
                                 'quantity': qty, 'buyerIsMaker': maker == 'true'})
                    if len(rows) > max_rows:
                        raise ValueError('window terlalu padat, naikkan batas secara eksplisit; jangan potong data')
    if first_time is None or first_time > day_start + 60_000 or last_time < day_start + 86_340_000:
        raise ValueError('arsip harian tampak tidak penuh; window DITOLAK')
    if not rows:
        raise ValueError('tidak ada transaksi pada window; tidak ada sinyal')
    return {'source': 'Binance USD-M daily aggTrades (SHA256 verified)', 'date': day,
            'start': start, 'end': end, 'dayTradesChecked': total,
            'complete': True, 'market': 'FUTURES', 'trades': rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--symbol', required=True, help='BTCUSDT, ETHUSDT, ...')
    parser.add_argument('--date', required=True, help='UTC YYYY-MM-DD')
    parser.add_argument('--start-utc', required=True, help='ISO 8601 UTC, e.g. 2026-09-25T12:00:00Z')
    parser.add_argument('--minutes', type=int, choices=(5, 15), default=5)
    parser.add_argument('--max-rows', type=int, default=100_000)
    parser.add_argument('--output', required=True, help='local .json output (research only)')
    args = parser.parse_args()
    if not re.fullmatch('[A-Z0-9]{2,24}USDT', args.symbol) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        parser.error('symbol/date invalid')
    if not (1 <= args.max_rows <= 250_000):
        parser.error('--max-rows harus 1..250000')
    start = int(dt.datetime.fromisoformat(args.start_utc.replace('Z', '+00:00')).timestamp() * 1000)
    end = start + args.minutes * 60_000
    archive = download_verified(args.symbol, args.date)
    result = extract(archive, args.date, start, end, args.max_rows)
    result['symbol'] = args.symbol
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')), encoding='utf8')
    print(json.dumps({'ok': True, 'symbol': args.symbol, 'date': args.date,
                      'windowTrades': len(result['trades']), 'dayTradesChecked': result['dayTradesChecked'],
                      'source': result['source'], 'output': str(output)}))


if __name__ == '__main__':
    main()
