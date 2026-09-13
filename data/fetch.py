import yfinance as yf, json, sys
from datetime import date
tickers = {"NVDA":"2020-04-01","AAPL":"2023-07-03","^GSPC":"2018-04-02"}
out={}
for t,start in tickers.items():
    h = yf.Ticker(t).history(start=start, interval="1wk", auto_adjust=True)
    if h.empty:
        print("EMPTY",t); continue
    s = h["Close"].dropna()
    pts=[[d.strftime("%Y-%m-%d"), round(float(v),2)] for d,v in s.items()]
    out[t]={"buy_date":pts[0][0],"buy":pts[0][1],"last_date":pts[-1][0],"last":pts[-1][1],"n":len(pts),"weekly":pts}
    print(t, pts[0], pts[-1], len(pts))
# try spacex tickers
for t in ["SPACEX","SPX","SPXC","SPCX"]:
    try:
        i=yf.Ticker(t).info; print("try",t, i.get("shortName"), i.get("quoteType"))
    except Exception as e: print("try",t,"err",str(e)[:60])
json.dump(out, open("data/prices.json","w"))
