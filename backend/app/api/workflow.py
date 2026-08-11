from fastapi import APIRouter, Depends

from app.core.security import require_role
from app.schemas.workflow import ResumeRequest, WorkflowRequest, WorkflowResponse
from app.workflows.orchestrator import resume_run, run_once

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


@router.post(
    "/{thread_id}/resume",
    response_model=WorkflowResponse,
    dependencies=[Depends(require_role("government"))],
)
def resume_workflow(thread_id: str, payload: ResumeRequest):
    """Continue a run paused at the approval gate (see orchestrator.resume_run)."""
    result = resume_run(thread_id, payload.decision)
    return {"status": "resumed", "result": result}
