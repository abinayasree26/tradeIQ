"""
STAP — DB connection test.
Run: python test_db_connection.py

Step 1 — socket test (no pip needed)
Step 2 — full DB test (needs: pip install asyncpg)
"""
import socket
import asyncio
import sys
import importlib

DB_HOST = "192.168.86.245"
DB_PORT = 5432
DB_NAME = "tradeiq_db"
DB_USER = "tradeiq"
DB_PASS = "tradeiq123"


def test_port():
    print(f"Step 1 — TCP check {DB_HOST}:{DB_PORT} ...")
    try:
        sock = socket.create_connection((DB_HOST, DB_PORT), timeout=5)
        sock.close()
        print(f"  ✓  Port reachable")
        return True
    except socket.timeout:
        print("  ✗  Timeout — VM unreachable or port 5432 blocked by firewall")
        return False
    except ConnectionRefusedError:
        print("  ✗  Refused — PostgreSQL is not running on that VM")
        return False
    except Exception as e:
        print(f"  ✗  {e}")
        return False


async def test_db():
    print(f"\nStep 2 — DB login test ...")
    asyncpg = importlib.import_module("asyncpg")   # avoids IDE false-positive
    try:
        conn = await asyncpg.connect(
            host=DB_HOST, port=DB_PORT,
            database=DB_NAME, user=DB_USER, password=DB_PASS,
        )
        ver  = await conn.fetchval("SELECT version()")
        db   = await conn.fetchval("SELECT current_database()")
        user = await conn.fetchval("SELECT current_user")
        rows = await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        )
        await conn.close()
        print(f"  ✓  Connected!")
        print(f"     Database : {db}")
        print(f"     User     : {user}")
        print(f"     PG       : {ver[:50]}")
        print(f"     Tables   : {[r['tablename'] for r in rows] or '(none yet)'}")
        print("\n  ✓  PASSED — Proxmox DB is ready!\n")
    except ModuleNotFoundError:
        print("  asyncpg not installed in this environment.")
        print("  Run:  pip install asyncpg  then retry.")
    except Exception as e:
        print(f"  ✗  Login failed: {e}")
        print("\n  Fix (SSH into 192.168.86.245):")
        print("    sudo systemctl status postgresql")
        print("    sudo cat /etc/postgresql/15/main/pg_hba.conf | grep stap")


if __name__ == "__main__":
    print("=" * 48)
    print("  TradeIQ DB Test  —  192.168.86.245:5432/tradeiq_db")
    print("=" * 48)
    if test_port():
        asyncio.run(test_db())
    else:
        print("\n  SSH into VM and run:")
        print("    sudo systemctl start postgresql")
        print("    sudo ufw allow 5432/tcp")
        sys.exit(1)
