"""
AkShare HTTP Sidecar Server
Port: 8001

Provides China A-share market data via AkShare Python library.
TypeScript client (akshare-equity-client.ts) calls this service over HTTP.

Symbol format: 600519.SH (Shanghai) / 000001.SZ (Shenzhen)
AkShare: 6-digit code with exchange prefix (e.g. "sh600519" / "sz000001")

Data sources used:
- /stock/list    : akshare.stock_info_a_code_name (multi-source)
- /stock/history : akshare.stock_zh_a_daily (Sina Finance)
- /stock/quote   : akshare.stock_zh_a_spot_em (East Money, may fail outside CN)
- /stock/profile : computed from list + latest daily bar
"""

import akshare as ak
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from typing import Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AkShare Sidecar", version="1.0.0")


def symbol_to_sina(symbol: str) -> str:
    """Convert '600519.SH' or '000001.SZ' to 'sh600519' / 'sz000001'."""
    parts = symbol.upper().split(".")
    code = parts[0]
    if len(parts) == 2:
        suffix = parts[1].lower()  # sh / sz
    else:
        # Infer from code prefix
        suffix = "sh" if code.startswith("6") or code.startswith("9") else "sz"
    return f"{suffix}{code}"


def df_to_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to list of dicts, replacing NaN/NaT/inf with None."""
    if df is None or df.empty:
        return []
    # Replace inf values with NaN first, then NaN with None
    df = df.replace([float("inf"), float("-inf")], float("nan"))
    records = []
    for row in df.to_dict(orient="records"):
        clean = {}
        for k, v in row.items():
            if isinstance(v, float) and (v != v or v == float("inf") or v == float("-inf")):
                # NaN or Inf → None
                clean[k] = None
            elif hasattr(v, "isoformat"):
                clean[k] = str(v)
            elif v is pd.NaT:
                clean[k] = None
            else:
                clean[k] = v
        records.append(clean)
    return records


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/stock/list")
def stock_list():
    """Return full A-share listing (symbol + name)."""
    try:
        df = ak.stock_info_a_code_name()
        # Columns: code, name
        records = []
        for _, row in df.iterrows():
            code = str(row.get("code", "")).strip()
            name = str(row.get("name", "")).strip()
            if not code:
                continue
            # Determine exchange suffix from code prefix
            if code.startswith("6") or code.startswith("9"):
                suffix = "SH"
            else:
                suffix = "SZ"
            symbol = f"{code}.{suffix}"
            records.append({"symbol": symbol, "name": name, "source": "akshare"})
        return {"results": records, "count": len(records)}
    except Exception as e:
        logger.error(f"stock_list error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/history")
def stock_history(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    period: str = Query("daily", description="daily/weekly/monthly"),
    start_date: Optional[str] = Query(None, description="YYYYMMDD or YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYYMMDD or YYYY-MM-DD"),
    adjust: str = Query("qfq", description="qfq/hfq/'' (no adjust)"),
):
    """
    Get OHLCV history for a single A-share stock.
    Uses Sina Finance (stock_zh_a_daily) — works globally.
    """
    try:
        sina_symbol = symbol_to_sina(symbol)

        # Normalize date format to YYYYMMDD
        def normalize_date(d: Optional[str]) -> Optional[str]:
            if d is None:
                return None
            return d.replace("-", "")

        kwargs: dict = {
            "symbol": sina_symbol,
            "adjust": adjust,
        }
        if start_date:
            kwargs["start_date"] = normalize_date(start_date)
        if end_date:
            kwargs["end_date"] = normalize_date(end_date)

        df = ak.stock_zh_a_daily(**kwargs)
        if df is None or df.empty:
            return {"results": []}

        # Resample if weekly or monthly requested
        if period == "weekly":
            df = df.set_index("date")
            df.index = pd.to_datetime(df.index)
            df = df.resample("W").agg({
                "open": "first", "high": "max", "low": "min", "close": "last",
                "volume": "sum", "amount": "sum",
            }).dropna(how="all").reset_index()
        elif period == "monthly":
            df = df.set_index("date")
            df.index = pd.to_datetime(df.index)
            df = df.resample("ME").agg({
                "open": "first", "high": "max", "low": "min", "close": "last",
                "volume": "sum", "amount": "sum",
            }).dropna(how="all").reset_index()

        # Normalize date column to string
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)

        # Add symbol column and rename columns to standard names
        df["symbol"] = symbol

        # Calculate change_pct
        if "close" in df.columns and len(df) > 0:
            df["change_pct"] = df["close"].pct_change() * 100

        records = df_to_records(df)
        return {"results": records}
    except Exception as e:
        logger.error(f"stock_history error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/quote")
def stock_quote():
    """
    Get real-time quotes for all A-share stocks.
    Tries East Money (stock_zh_a_spot_em) first, falls back to empty.
    """
    try:
        df = ak.stock_zh_a_spot_em()
        if df is None or df.empty:
            return {"results": []}

        col_map = {
            "代码": "code",
            "名称": "name",
            "最新价": "price",
            "涨跌幅": "change_pct",
            "涨跌额": "change",
            "成交量": "volume",
            "成交额": "turnover",
            "振幅": "amplitude",
            "最高": "high",
            "最低": "low",
            "今开": "open",
            "昨收": "prev_close",
            "量比": "volume_ratio",
            "换手率": "turnover_rate",
            "市盈率-动态": "pe_ratio",
            "市净率": "pb_ratio",
            "总市值": "market_cap",
            "流通市值": "circulating_market_cap",
        }
        df = df.rename(columns=col_map)

        # Build symbol with exchange suffix
        def make_symbol(row):
            code = str(row.get("code", "")).strip()
            if code.startswith("6") or code.startswith("9"):
                return f"{code}.SH"
            return f"{code}.SZ"

        df["symbol"] = df.apply(make_symbol, axis=1)

        records = df_to_records(df)
        return {"results": records}
    except Exception as e:
        logger.warning(f"stock_quote (East Money) failed: {e}, returning empty")
        return {"results": [], "warning": str(e)}


@app.get("/stock/profile")
def stock_profile(symbol: str = Query(..., description="e.g. 600519.SH")):
    """
    Get basic info for a single A-share stock.
    Tries East Money (stock_individual_info_em) first, falls back to listing data.
    """
    try:
        code = symbol.split(".")[0]
        df = ak.stock_individual_info_em(symbol=code)
        if df is not None and not df.empty:
            info: dict = {}
            for _, row in df.iterrows():
                item = str(row.get("item", "")).strip()
                value = row.get("value")
                info[item] = value
            result = {
                "symbol": symbol,
                "name": info.get("股票简称", ""),
                "stock_exchange": info.get("上市交易所", ""),
                "listing_date": info.get("上市时间", ""),
                "total_shares": info.get("总股本", None),
                "circulating_shares": info.get("流通股", None),
                "industry": info.get("行业", ""),
                "region": info.get("地区", ""),
            }
            return {"results": [result]}
    except Exception as e:
        logger.warning(f"stock_profile (East Money) failed: {e}, falling back to basic info")

    # Fallback: build minimal profile from listing data
    try:
        df = ak.stock_info_a_code_name()
        code = symbol.split(".")[0]
        match = df[df["code"] == code]
        if not match.empty:
            name = str(match.iloc[0]["name"]).strip()
        else:
            name = ""
        exchange = "上海证券交易所" if symbol.upper().endswith(".SH") else "深圳证券交易所"
        return {"results": [{
            "symbol": symbol,
            "name": name,
            "stock_exchange": exchange,
        }]}
    except Exception as e2:
        logger.error(f"stock_profile fallback failed: {e2}")
        raise HTTPException(status_code=500, detail=str(e2))


def symbol_to_eastmoney(symbol: str) -> str:
    """Convert '600519.SH' or '000001.SZ' to 'SH600519' / 'SZ000001' for East Money APIs."""
    parts = symbol.upper().split(".")
    code = parts[0]
    if len(parts) == 2:
        suffix = parts[1]  # SH / SZ
    else:
        # Infer from code prefix
        suffix = "SH" if code.startswith("6") or code.startswith("9") else "SZ"
    return f"{suffix}{code}"


def map_report_type(report_type: str) -> str:
    """Map Chinese report type to standard fiscal period."""
    mapping = {
        "年度报告": "Annual",
        "一季报": "Q1",
        "一季度的更新": "Q1",
        "二季报": "Q2",
        "半年度报告": "Q2",
        "三季报": "Q3",
        "三季度更新": "Q3",
        "四季报": "Q4",
    }
    return mapping.get(report_type, "Annual")


def extract_fiscal_year(date_str: str) -> int:
    """Extract fiscal year from date string (YYYY-MM-DD or YYYYMMDD)."""
    if "-" in date_str:
        return int(date_str.split("-")[0])
    return int(date_str[:4])


def map_financial_columns(df: pd.DataFrame, statement_type: str) -> pd.DataFrame:
    """Map Chinese column names to English for financial statements."""
    if statement_type == "income":
        col_mapping = {
            "REPORT_DATE": "period_ending",
            "REPORT_TYPE": "fiscal_period_raw",
            # Income statement common fields
            "NET_PROFIT": "net_income",
            "TOTAL_OPERATE_INCOME": "total_revenue",
            "OPERATE_INCOME": "revenue",
            "OPERATE_COST": "cost_of_revenue",
            "OPERATE_EXPENSE": "operating_expenses",
            "INCOME_TAX": "income_tax_expense",
        }
    elif statement_type == "balance":
        col_mapping = {
            "REPORT_DATE": "period_ending",
            "REPORT_TYPE": "fiscal_period_raw",
            # Balance sheet common fields
            "TOTAL_ASSETS": "total_assets",
            "TOTAL_CURRENT_ASSETS": "current_assets",
            "FIXED_ASSET": "fixed_assets",
            "TOTAL_LIABILITIES": "total_liabilities",
            "TOTAL_CURRENT_LIAB": "current_liabilities",
            "TOTAL_EQUITY": "total_equity",
            "TOTAL_LIAB_EQUITY": "total_liabilities_and_equity",
            "TOTAL_NONCURRENT_ASSETS": "noncurrent_assets",
            "TOTAL_NONCURRENT_LIAB": "noncurrent_liabilities",
        }
    elif statement_type == "cashflow":
        col_mapping = {
            "REPORT_DATE": "period_ending",
            "REPORT_TYPE": "fiscal_period_raw",
            # Cash flow common fields
            "NETCASH_OPERATE": "operating_cash_flow",
            "NETCASH_INVEST": "investing_cash_flow",
            "NETCASH_FINANCE": "financing_cash_flow",
            "CASH_EQUIVALENTS_AT_END": "cash_at_end",
        }
    elif statement_type == "ratios":
        col_mapping = {
            "REPORT_DATE": "period_ending",
            "REPORT_TYPE": "fiscal_period_raw",
            # Financial ratios
            "ROE加权": "roe",
            "毛利率": "gross_margin",
            "净利率": "net_margin",
            "资产负债率": "debt_to_assets",
            "流动比率": "current_ratio",
            "速动比率": "quick_ratio",
            "总资产周转率": "asset_turnover",
        }
    else:
        return df

    # Only rename columns that exist in the DataFrame
    existing_mapping = {k: v for k, v in col_mapping.items() if k in df.columns}
    df = df.rename(columns=existing_mapping)

    # Process fiscal_period mapping
    if "fiscal_period_raw" in df.columns:
        df["fiscal_period"] = df["fiscal_period_raw"].apply(map_report_type)
        df = df.drop(columns=["fiscal_period_raw"])

    # Extract fiscal_year from period_ending
    if "period_ending" in df.columns:
        df["fiscal_year"] = df["period_ending"].apply(
            lambda x: extract_fiscal_year(str(x)) if pd.notna(x) else None
        )

    return df


@app.get("/stock/financials/income")
def stock_financials_income(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    limit: Optional[int] = Query(None, description="Number of periods to return"),
):
    """Get income statement for China A-share stocks."""
    try:
        em_symbol = symbol_to_eastmoney(symbol)
        df = ak.stock_profit_sheet_by_report_em(symbol=em_symbol)

        if df is None or df.empty:
            return {"results": []}

        df = map_financial_columns(df, "income")
        df["symbol"] = symbol

        # Sort by date descending (most recent first) and apply limit
        df = df.sort_values("period_ending", ascending=False)
        if limit and limit > 0:
            df = df.head(limit)

        records = df_to_records(df)
        return {"results": records}
    except Exception as e:
        logger.error(f"stock_financials_income error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/financials/balance")
def stock_financials_balance(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    limit: Optional[int] = Query(None, description="Number of periods to return"),
):
    """Get balance sheet for China A-share stocks."""
    try:
        em_symbol = symbol_to_eastmoney(symbol)
        df = ak.stock_balance_sheet_by_report_em(symbol=em_symbol)

        if df is None or df.empty:
            return {"results": []}

        df = map_financial_columns(df, "balance")
        df["symbol"] = symbol

        # Sort by date descending (most recent first) and apply limit
        df = df.sort_values("period_ending", ascending=False)
        if limit and limit > 0:
            df = df.head(limit)

        records = df_to_records(df)
        return {"results": records}
    except Exception as e:
        logger.error(f"stock_financials_balance error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/financials/cashflow")
def stock_financials_cashflow(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    limit: Optional[int] = Query(None, description="Number of periods to return"),
):
    """Get cash flow statement for China A-share stocks."""
    try:
        em_symbol = symbol_to_eastmoney(symbol)
        df = ak.stock_cash_flow_sheet_by_report_em(symbol=em_symbol)

        if df is None or df.empty:
            return {"results": []}

        df = map_financial_columns(df, "cashflow")
        df["symbol"] = symbol

        # Sort by date descending (most recent first) and apply limit
        df = df.sort_values("period_ending", ascending=False)
        if limit and limit > 0:
            df = df.head(limit)

        records = df_to_records(df)
        return {"results": records}
    except Exception as e:
        logger.error(f"stock_financials_cashflow error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/financials/ratios")
def stock_financials_ratios(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    limit: Optional[int] = Query(None, description="Number of periods to return"),
):
    """Get financial ratios for China A-share stocks.

    Calculates ratios from income statement and balance sheet data.
    """
    try:
        em_symbol = symbol_to_eastmoney(symbol)

        # Fetch both income statement and balance sheet
        income_df = ak.stock_profit_sheet_by_report_em(symbol=em_symbol)
        balance_df = ak.stock_balance_sheet_by_report_em(symbol=em_symbol)

        if income_df is None or income_df.empty or balance_df is None or balance_df.empty:
            return {"results": []}

        # Merge on REPORT_DATE (original column name before mapping)
        merged = pd.merge(
            income_df[["REPORT_DATE", "REPORT_TYPE", "PARENT_NETPROFIT", "TOTAL_OPERATE_INCOME", "OPERATE_PROFIT", "OPERATE_COST"]],
            balance_df[["REPORT_DATE", "TOTAL_EQUITY", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_CURRENT_ASSETS", "TOTAL_CURRENT_LIAB"]],
            on="REPORT_DATE",
            how="inner"
        )

        # Calculate ratios
        results = []
        for _, row in merged.iterrows():
            report_date = str(row.get("REPORT_DATE", ""))
            report_type = row.get("REPORT_TYPE", "")

            net_profit = row.get("PARENT_NETPROFIT", 0) or 0
            revenue = row.get("TOTAL_OPERATE_INCOME", 0) or 0
            operating_profit = row.get("OPERATE_PROFIT", 0) or 0
            cost_of_revenue = row.get("OPERATE_COST", 0) or 0

            equity = row.get("TOTAL_EQUITY", 0)
            if equity is None or equity != equity or equity == 0:
                equity = None

            assets = row.get("TOTAL_ASSETS", 0)
            if assets is None or assets != assets or assets == 0:
                assets = None

            liabilities = row.get("TOTAL_LIABILITIES", 0) or 0

            current_assets = row.get("TOTAL_CURRENT_ASSETS", 0)
            if current_assets is None or current_assets != current_assets or current_assets == 0:
                current_assets = None

            current_liab = row.get("TOTAL_CURRENT_LIAB", 0) or 0

            # Calculate ratios
            roe = round(net_profit / equity * 100, 2) if equity and equity != 0 else None
            gross_margin = round((revenue - cost_of_revenue) / revenue * 100, 2) if revenue and revenue != 0 else None
            operating_margin = round(operating_profit / revenue * 100, 2) if revenue and revenue != 0 else None
            net_margin = round(net_profit / revenue * 100, 2) if revenue and revenue != 0 else None
            debt_to_assets = round(liabilities / assets * 100, 2) if assets and assets != 0 else None
            current_ratio = round(current_assets / current_liab, 2) if current_assets and current_liab and current_liab != 0 else None
            asset_turnover = round(revenue / assets, 2) if assets and assets != 0 else None

            result = {
                "symbol": symbol,
                "period_ending": report_date,
                "fiscal_period": map_report_type(report_type),
                "fiscal_year": extract_fiscal_year(report_date),
                "roe": roe,
                "gross_margin": gross_margin,
                "operating_margin": operating_margin,
                "net_margin": net_margin,
                "debt_to_assets": debt_to_assets,
                "current_ratio": current_ratio,
                "asset_turnover": asset_turnover,
            }
            results.append(result)

        # Sort by date descending and apply limit
        results.sort(key=lambda x: x["period_ending"], reverse=True)
        if limit and limit > 0:
            results = results[:limit]

        return {"results": results}
    except Exception as e:
        logger.error(f"stock_financials_ratios error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/financials/calendar")
def stock_financials_calendar(
    symbol: str = Query(..., description="e.g. 600519.SH"),
    period: Optional[str] = Query(None, description="Report period filter, e.g. '2024年报', '2025一季报'"),
    limit: Optional[int] = Query(None, description="Number of entries to return (default: 10)"),
):
    """Get earnings calendar for China A-share stocks.

    Returns report period, report date, and actual disclosure date.
    Data is extracted from financial statement data.
    """
    try:
        em_symbol = symbol_to_eastmoney(symbol)
        income_df = ak.stock_profit_sheet_by_report_em(symbol=em_symbol)

        if income_df is None or income_df.empty:
            return {"results": []}

        # Select relevant columns
        calendar_df = income_df[["REPORT_DATE", "REPORT_DATE_NAME", "NOTICE_DATE"]].copy()

        # Apply period filter if specified
        if period:
            calendar_df = calendar_df[calendar_df["REPORT_DATE_NAME"].str.contains(period, na=False)]

        # Sort by notice date descending
        calendar_df = calendar_df.sort_values("NOTICE_DATE", ascending=False)

        # Apply limit
        if limit and limit > 0:
            calendar_df = calendar_df.head(limit)

        # Map columns to standard names
        calendar_df = calendar_df.rename(columns={
            "REPORT_DATE": "report_date",
            "REPORT_DATE_NAME": "report_name",
            "NOTICE_DATE": "actual_date"
        })

        # Add symbol
        calendar_df["symbol"] = symbol

        # Convert dates to string format
        for col in ["report_date", "actual_date"]:
            if col in calendar_df.columns:
                calendar_df[col] = calendar_df[col].apply(
                    lambda x: str(x) if pd.notna(x) else None
                )

        # Select columns
        calendar_df = calendar_df[["symbol", "report_name", "report_date", "actual_date"]]

        records = df_to_records(calendar_df)
        return {"results": records}
    except Exception as e:
        logger.error(f"stock_financials_calendar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _format_date(date_val) -> Optional[str]:
    """Format date value to string."""
    if pd.isna(date_val) or date_val is None:
        return None
    if hasattr(date_val, "strftime"):
        return date_val.strftime("%Y-%m-%d")
    return str(date_val)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
