from fastapi import APIRouter, Depends

from app.core.security import require_role
from app.schemas.workflow import WorkflowRequest, WorkflowResponse
from app.workflows.orchestrator import run_once

router = APIRouter()


@router.get("/status")
def workflow_status():
    return {"workflow": "nexus_grid", "status": "ready"}


@router.post(
    "/trigger",
    response_model=WorkflowResponse,
    dependencies=[Depends(require_role("government"))],
)
def trigger_workflow(payload: WorkflowRequest):
    result = run_once(payload.model_dump(exclude_none=True))
    return {"status": "triggered", "result": result}
