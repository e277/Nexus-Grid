"""Generic SQLAlchemy repository shared by all entity repositories."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


class SQLAlchemyRepository(Generic[ModelT]):
    """get / list / create operations for a single mapped model."""

    def __init__(self, model: type[ModelT]) -> None:
        self.model = model

    def get(self, db: Session, obj_id: int) -> ModelT | None:
        return db.get(self.model, obj_id)

    def list(
        self, db: Session, skip: int = 0, limit: int = 100, **filters: Any
    ) -> list[ModelT]:
        query = db.query(self.model)
        for field, value in filters.items():
            if value is not None:
                query = query.filter(getattr(self.model, field) == value)
        return query.offset(skip).limit(limit).all()

    def create(self, db: Session, data: BaseModel | dict[str, Any]) -> ModelT:
        fields = data.model_dump() if isinstance(data, BaseModel) else data
        db_obj = self.model(**fields)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
