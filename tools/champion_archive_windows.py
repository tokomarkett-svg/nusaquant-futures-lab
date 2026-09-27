#!/usr/bin/env python3
"""Convert a SHA-verified COMPLETE USD-M aggTrades day to 288 bounded 5m JSONL windows.

Outputs are stored only in ignored .cache/champion-archive. No prices are interpolated.
The .json metadata records SHA256 of the derived gz; an interrupted/partial day is deleted.
"""
import argparse
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import math
import pathlib
import re
import zipfile

from champion_archive_probe import CACHE, download_verified

STEP = 300_000


def convert_day(symbol: str, day: str, max_rows: int = 100_000) -> dict:
    archive = download_verified(symbol, day)
    day_start = int(dt.datetime.fromisoformat(day).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    output = CACHE / f'{symbol}-5m-{day}.jsonl.gz'
    meta_path = CACHE / f'{symbol}-5m-{day}.meta.json'
    temporary = CACHE / f'{symbol}-5m-{day}.partial.gz'
    previous_id = previous_time = first_time = last_time = None
    current = 0
    trades = []
    count = windows = 0
    try:
        with zipfile.ZipFile(archive) as z:
            if z.namelist() != [archive.stem + '.csv']:
                raise ValueError('nama CSV bukan yang diharapkan')
            with z.open(z.namelist()[0]) as f, gzip.open(temporary, 'wt', encoding='utf8', compresslevel=5) as out:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf8'))
                required = {'agg_trade_id', 'price', 'quantity', 'transact_time', 'is_buyer_maker'}
                if not required.issubset(reader.fieldnames or []):
                    raise ValueError('kolom trade tidak lengkap')

                def finish_window() -> None:
                    nonlocal trades, windows
                    if not trades:
                        raise ValueError(f'window {windows} tidak berisi trade; data tidak lengkap')
                    out.write(json.dumps({'symbol': symbol, 'start': day_start + windows * STEP,
                                          'end': day_start + (windows + 1) * STEP,
                                          'trades': trades}, separators=(',', ':')) + '\n')
                    windows += 1
                    trades = []

                for row in reader:
                    ident = int(row['agg_trade_id'])
                    when = int(row['transact_time'])
                    price = float(row['price'])
                    qty = float(row['quantity'])
                    maker = row['is_buyer_maker']
                    if ((previous_id is not None and ident != previous_id + 1) or
                            (previous_time is not None and when < previous_time) or
                            not (day_start <= when < day_start + 86_400_000) or
                            not (math.isfinite(price) and price > 0 and math.isfinite(qty) and qty > 0)
                            or maker not in ('true', 'false')):
                        raise ValueError('gap ID / waktu / harga / sisi trade; hari ditolak')
                    bin_index = (when - day_start) // STEP
                    if bin_index < current:
                        raise ValueError('jendela waktu mundur')
                    while bin_index > current:
                        finish_window()
                        current += 1
                    trades.append({'id': ident, 'time': when, 'price': price,
                                   'quantity': qty, 'buyerIsMaker': maker == 'true'})
                    if len(trades) > max_rows:
                        raise ValueError('window terlalu padat; jangan potong data')
                    first_time = when if first_time is None else first_time
                    last_time = previous_time = when
                    previous_id = ident
                    count += 1
                if first_time is None or first_time > day_start + 60_000 or last_time < day_start + 86_340_000:
                    raise ValueError('arsip harian tidak penuh')
                finish_window()
                if windows != 288:
                    raise ValueError(f'window cuma {windows} dari 288')
        digest = hashlib.sha256()
        with temporary.open('rb') as f:
            while chunk := f.read(1024 * 1024):
                digest.update(chunk)
        meta = {'source': 'Binance USD-M daily aggTrades SHA256 verified', 'symbol': symbol,
                'date': day, 'start': day_start, 'end': day_start + 86_400_000,
                'windows': windows, 'trades': count, 'sha256': digest.hexdigest()}
        temporary.replace(output)
        meta_path.write_text(json.dumps(meta, separators=(',', ':')), encoding='utf8')
        return meta
    except Exception:
        temporary.unlink(missing_ok=True)
        output.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--date', required=True)
    parser.add_argument('--max-rows', type=int, default=100_000)
    args = parser.parse_args()
    if not re.fullmatch('[A-Z0-9]{2,24}USDT', args.symbol) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        parser.error('symbol atau tanggal invalid')
    if not 1 <= args.max_rows <= 250_000:
        parser.error('max rows harus 1..250000')
    print(json.dumps(convert_day(args.symbol, args.date, args.max_rows)))


if __name__ == '__main__':
    main()
