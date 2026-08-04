"""Registration, OAuth2 password login, and the current-user endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.services import activity_service

router = APIRouter()


@router.post("/register", response_model=schemas.user.User, status_code=201)
def register(payload: schemas.user.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    activity_service.record_audit(
        db, actor=user.email, action="user.registered", entity_type="user", entity_id=user.id
    )
    return user


@router.post("/token", response_model=schemas.user.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form.username).first()
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")

    activity_service.record_audit(
        db, actor=user.email, action="user.login", entity_type="user", entity_id=user.id
    )
    return schemas.user.Token(access_token=create_access_token(user.email, user.role))


@router.get("/me", response_model=schemas.user.User)
def me(user: models.User = Depends(get_current_user)):
    return user
