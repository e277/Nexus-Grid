"""Auth flow: register, login, current-user, and RBAC dependency."""

from fastapi.testclient import TestClient

from app.core.security import require_role
from app.main import app


def test_register_login_me_flow():
    with TestClient(app) as client:
        email = "ana@nexusgrid.dev"
        register = client.post(
            "/auth/register",
            json={"email": email, "password": "s3cret-pass", "role": "farmer"},
        )
        assert register.status_code == 201
        assert register.json()["email"] == email
        # No password material in the response
        assert "password" not in register.json()
        assert "hashed_password" not in register.json()

        duplicate = client.post(
            "/auth/register",
            json={"email": email, "password": "s3cret-pass", "role": "farmer"},
        )
        assert duplicate.status_code == 409

        bad_login = client.post(
            "/auth/token", data={"username": email, "password": "wrong-pass"}
        )
        assert bad_login.status_code == 401

        login = client.post(
            "/auth/token", data={"username": email, "password": "s3cret-pass"}
        )
        assert login.status_code == 200
        token = login.json()["access_token"]

        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == email
        assert me.json()["role"] == "farmer"

        unauthorized = client.get("/auth/me")
        assert unauthorized.status_code == 401


def test_rbac_dependency():
    from fastapi import Depends

    # A protected probe route registered only for this test
    @app.get("/rbac-probe")
    def probe(user=Depends(require_role("government"))):
        return {"ok": True, "role": user.role}

    try:
        with TestClient(app) as client:
            client.post(
                "/auth/register",
                json={"email": "gov@nexusgrid.dev", "password": "s3cret-pass", "role": "government"},
            )
            client.post(
                "/auth/register",
                json={"email": "farm@nexusgrid.dev", "password": "s3cret-pass", "role": "farmer"},
            )
            gov_token = client.post(
                "/auth/token", data={"username": "gov@nexusgrid.dev", "password": "s3cret-pass"}
            ).json()["access_token"]
            farm_token = client.post(
                "/auth/token", data={"username": "farm@nexusgrid.dev", "password": "s3cret-pass"}
            ).json()["access_token"]

            allowed = client.get(
                "/rbac-probe", headers={"Authorization": f"Bearer {gov_token}"}
            )
            assert allowed.status_code == 200

            denied = client.get(
                "/rbac-probe", headers={"Authorization": f"Bearer {farm_token}"}
            )
            assert denied.status_code == 403
    finally:
        app.router.routes.pop()
