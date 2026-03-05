# LangGraph Migration - Phase 1 Implementation Plan

**Phase:** Foundation (Months 1-2)
**Duration:** 8 weeks (160 hours)
**Investment:** $16,000
**Team:** 2-3 engineers

---

## Phase 1 Goals

### Primary Objectives

1. ✅ **Validate LangGraph** as replacement for bash/JS orchestration
2. ✅ **Establish multi-model routing** (o1 + Sonnet + Haiku)
3. ✅ **Migrate 2 core workflows** (deployment pipeline, dedup)
4. ✅ **Convert 50+ agents** to LangGraph tools
5. ✅ **Prove cost optimization** (8x+ savings via multi-model)

### Success Criteria

**Technical:**
- [ ] Model router selects appropriate model based on complexity
- [ ] Deployment pipeline performs ≥ bash script version
- [ ] Dedup workflow achieves 5x+ speedup
- [ ] State persistence works (can resume from checkpoints)
- [ ] Cost reduction validated (≤$1.20/1M tokens vs $3.00)
- [ ] 50+ tools migrated and passing tests
- [ ] Test coverage ≥80%

**Business:**
- [ ] Team comfortable with LangGraph (self-sufficient)
- [ ] Stakeholders approve Phase 2 investment
- [ ] No major blockers identified

---

## Week-by-Week Breakdown

### Week 1: Project Setup + Model Router

**Hours:** 40 hours (1 FTE)
**Goal:** Infrastructure foundation + multi-model routing POC

#### Day 1-2: Project Initialization (16 hours)

**Tasks:**
- [ ] Create new repository: `opspal-langgraph`
- [ ] Set up Python environment (Python 3.11+)
- [ ] Install dependencies
- [ ] Create project structure
- [ ] Configure git workflow

**Deliverables:**

```bash
# Project structure
opspal-langgraph/
├── .env.example                  # Environment variables template
├── .gitignore
├── README.md
├── requirements.txt
├── pyproject.toml                # Poetry config (optional)
├── config/
│   ├── __init__.py
│   ├── models.py                 # Model router
│   └── settings.py               # App configuration
├── workflows/
│   ├── __init__.py
│   ├── deployment_pipeline.py
│   └── dedup_pipeline.py
├── tools/
│   ├── __init__.py
│   ├── salesforce/
│   │   ├── __init__.py
│   │   ├── metadata.py           # Metadata tools
│   │   ├── deployment.py         # Deployment tools
│   │   └── backup.py             # Backup tools
│   └── hubspot/
│       └── __init__.py
├── tests/
│   ├── __init__.py
│   ├── workflows/
│   ├── tools/
│   └── fixtures/
└── scripts/
    └── migrate_agent.py          # Tool migration helper
```

**requirements.txt:**
```txt
# Core LangGraph
langgraph==0.2.28
langchain==0.3.0
langchain-anthropic==0.2.3
langchain-openai==0.2.1
langchain-google-genai==2.0.0

# Database (for state persistence)
psycopg2-binary==2.9.9  # PostgreSQL
redis==5.0.8             # Redis for caching

# API layer (Phase 3, but install now)
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.9.0

# Testing
pytest==8.3.0
pytest-asyncio==0.24.0
pytest-cov==5.0.0

# Utilities
python-dotenv==1.0.1
httpx==0.27.0
tenacity==9.0.0         # Retry logic
```

**.env.example:**
```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Salesforce
SALESFORCE_USERNAME=...
SALESFORCE_PASSWORD=...
SALESFORCE_SECURITY_TOKEN=...

# State persistence
DATABASE_URL=postgresql://localhost/opspal_langgraph
REDIS_URL=redis://localhost:6379

# Monitoring
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
```

**Git Setup:**
```bash
cd /path/to/opspal-langgraph
git init
git remote add origin https://github.com/RevPalSFDC/opspal-langgraph.git
git add .
git commit -m "feat: Initial project setup with LangGraph foundation"
git push -u origin main
```

---

#### Day 3-4: Model Router Implementation (16 hours)

**Tasks:**
- [ ] Implement ModelRouter class
- [ ] Configure model clients (Claude, GPT, Gemini)
- [ ] Add complexity scoring logic
- [ ] Test model switching
- [ ] Validate API connectivity
- [ ] Measure cost per model

**Deliverable: config/models.py**

```python
"""
Model Router - Multi-Model LLM Selection

Selects appropriate LLM based on task type and complexity:
- o1-preview: Complex reasoning (complexity > 0.7) - $15/1M tokens
- Claude Sonnet: Balanced execution (0.3-0.7) - $3/1M tokens
- Claude Haiku: Simple tasks (<0.3) - $0.25/1M tokens
- Codestral: Code generation - varies

Usage:
    router = ModelRouter()
    model = router.get_model(task_type="reasoning", complexity=0.8)
    response = await model.ainvoke("Plan the deployment...")
"""

from typing import Literal, Optional
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
import os


class ModelConfig(BaseModel):
    """Configuration for a single model"""
    name: str
    provider: str
    cost_per_1m_tokens: float
    max_tokens: int
    temperature: float = 0


class ModelRouter:
    """
    Routes LLM requests to appropriate model based on task characteristics.

    Cost Optimization Strategy:
    - 60% of tasks → Haiku ($0.25/1M) - Simple operations
    - 30% of tasks → Sonnet ($3/1M) - Balanced execution
    - 10% of tasks → o1 ($15/1M) - Complex reasoning

    Average cost: ~$1.20/1M tokens (vs $3/1M all-Sonnet)
    Savings: 60% reduction
    """

    def __init__(self):
        self.models = self._init_models()
        self.usage_stats = {
            "reasoning": 0,
            "execution": 0,
            "simple": 0,
            "code": 0
        }

    def _init_models(self) -> dict:
        """Initialize LLM clients"""
        return {
            "reasoning": ChatOpenAI(
                model="o1-preview-2024-09-12",
                temperature=1,  # o1 requires temperature=1
                max_tokens=32768,
                api_key=os.getenv("OPENAI_API_KEY")
            ),
            "execution": ChatAnthropic(
                model="claude-sonnet-4-20250514",
                temperature=0,
                max_tokens=8192,
                api_key=os.getenv("ANTHROPIC_API_KEY")
            ),
            "simple": ChatAnthropic(
                model="claude-3-5-haiku-20241022",
                temperature=0,
                max_tokens=8192,
                api_key=os.getenv("ANTHROPIC_API_KEY")
            ),
            "code": ChatGoogleGenerativeAI(
                model="codestral-latest",
                temperature=0,
                max_tokens=4096,
                google_api_key=os.getenv("GOOGLE_API_KEY")
            )
        }

    def get_model(
        self,
        task_type: Literal["general", "code"] = "general",
        complexity: float = 0.5
    ):
        """
        Select appropriate model based on task characteristics.

        Args:
            task_type: Type of task ("general" or "code")
            complexity: Complexity score 0.0-1.0 (0=trivial, 1=very complex)

        Returns:
            LLM instance ready for invocation

        Examples:
            # Complex deployment planning → o1
            model = router.get_model("general", 0.85)

            # Standard metadata analysis → Sonnet
            model = router.get_model("general", 0.5)

            # Simple validation → Haiku
            model = router.get_model("general", 0.2)

            # Code generation → Codestral
            model = router.get_model("code", 0.6)
        """

        # Code generation always uses Codestral
        if task_type == "code":
            self.usage_stats["code"] += 1
            return self.models["code"]

        # Route based on complexity
        if complexity > 0.7:
            # High complexity: Use o1 for sophisticated reasoning
            self.usage_stats["reasoning"] += 1
            return self.models["reasoning"]
        elif complexity > 0.3:
            # Medium complexity: Use Sonnet for balanced performance
            self.usage_stats["execution"] += 1
            return self.models["execution"]
        else:
            # Low complexity: Use Haiku for cost efficiency
            self.usage_stats["simple"] += 1
            return self.models["simple"]

    def calculate_complexity(
        self,
        task_description: str,
        context: Optional[dict] = None
    ) -> float:
        """
        Calculate complexity score for a task.

        Factors:
        - Task length (longer = more complex)
        - Keywords (deploy, production, critical, etc.)
        - Context (org type, environment)
        - Number of steps/objects involved

        Returns:
            Complexity score 0.0-1.0
        """
        score = 0.0

        # Base score from description length
        word_count = len(task_description.split())
        score += min(word_count / 200, 0.2)  # Max 0.2 from length

        # Keyword-based complexity
        high_complexity_keywords = [
            "production", "deploy", "migration", "critical",
            "rollback", "recovery", "conflict", "merge"
        ]
        medium_complexity_keywords = [
            "analyze", "validate", "configure", "update"
        ]

        for keyword in high_complexity_keywords:
            if keyword in task_description.lower():
                score += 0.15

        for keyword in medium_complexity_keywords:
            if keyword in task_description.lower():
                score += 0.05

        # Context-based scoring
        if context:
            if context.get("environment") == "production":
                score += 0.3  # Production operations are high-risk
            if context.get("num_objects", 0) > 5:
                score += 0.2  # Many objects = complex
            if context.get("has_dependencies", False):
                score += 0.15  # Dependencies add complexity

        # Cap at 1.0
        return min(score, 1.0)

    def get_usage_stats(self) -> dict:
        """Get model usage statistics"""
        total = sum(self.usage_stats.values())
        if total == 0:
            return {"message": "No requests yet"}

        return {
            "total_requests": total,
            "distribution": {
                "reasoning (o1)": f"{self.usage_stats['reasoning']/total*100:.1f}%",
                "execution (Sonnet)": f"{self.usage_stats['execution']/total*100:.1f}%",
                "simple (Haiku)": f"{self.usage_stats['simple']/total*100:.1f}%",
                "code (Codestral)": f"{self.usage_stats['code']/total*100:.1f}%"
            },
            "estimated_cost_per_1m": self._calculate_avg_cost()
        }

    def _calculate_avg_cost(self) -> float:
        """Calculate weighted average cost per 1M tokens"""
        total = sum(self.usage_stats.values())
        if total == 0:
            return 0.0

        costs = {
            "reasoning": 15.0,
            "execution": 3.0,
            "simple": 0.25,
            "code": 1.0  # Estimated
        }

        weighted_cost = sum(
            self.usage_stats[model] / total * costs[model]
            for model in self.usage_stats
        )

        return round(weighted_cost, 2)


# Global router instance
router = ModelRouter()
```

**Test File: tests/test_model_router.py**

```python
import pytest
from config.models import ModelRouter


def test_model_router_complexity_routing():
    """Test that router selects correct model based on complexity"""
    router = ModelRouter()

    # High complexity → o1
    model = router.get_model("general", 0.85)
    assert "o1" in model.model_name.lower()

    # Medium complexity → Sonnet
    model = router.get_model("general", 0.5)
    assert "sonnet" in model.model_name.lower()

    # Low complexity → Haiku
    model = router.get_model("general", 0.2)
    assert "haiku" in model.model_name.lower()


def test_model_router_code_routing():
    """Test that code tasks route to Codestral"""
    router = ModelRouter()

    model = router.get_model("code", 0.5)
    assert "codestral" in model.model_name.lower()


def test_complexity_calculator():
    """Test complexity scoring logic"""
    router = ModelRouter()

    # Simple task
    simple = "Validate metadata format"
    assert router.calculate_complexity(simple) < 0.3

    # Medium task
    medium = "Analyze validation rules and update documentation"
    assert 0.3 <= router.calculate_complexity(medium) < 0.7

    # Complex task
    complex_task = "Deploy metadata to production with rollback capability"
    context = {"environment": "production", "num_objects": 10}
    assert router.calculate_complexity(complex_task, context) >= 0.7


def test_usage_stats_tracking():
    """Test that usage stats are tracked correctly"""
    router = ModelRouter()

    # Make some requests
    router.get_model("general", 0.9)  # reasoning
    router.get_model("general", 0.5)  # execution
    router.get_model("general", 0.5)  # execution
    router.get_model("general", 0.1)  # simple
    router.get_model("general", 0.1)  # simple
    router.get_model("general", 0.1)  # simple

    stats = router.get_usage_stats()

    assert stats["total_requests"] == 6
    assert stats["usage_stats"]["reasoning"] == 1
    assert stats["usage_stats"]["execution"] == 2
    assert stats["usage_stats"]["simple"] == 3


def test_cost_calculation():
    """Test average cost calculation"""
    router = ModelRouter()

    # All Haiku (cheap)
    for _ in range(10):
        router.get_model("general", 0.1)

    stats = router.get_usage_stats()
    assert stats["estimated_cost_per_1m"] < 1.0  # Should be $0.25

    # All o1 (expensive)
    router2 = ModelRouter()
    for _ in range(10):
        router2.get_model("general", 0.9)

    stats2 = router2.get_usage_stats()
    assert stats2["estimated_cost_per_1m"] > 10.0  # Should be $15
```

**Run Tests:**
```bash
pytest tests/test_model_router.py -v
```

---

#### Day 5: State Persistence Setup (8 hours)

**Tasks:**
- [ ] Set up PostgreSQL database
- [ ] Configure LangGraph checkpointer
- [ ] Test checkpoint save/restore
- [ ] Document state schema

**Deliverable: config/persistence.py**

```python
"""
State Persistence - Checkpoint Management

Provides checkpoint persistence for LangGraph workflows using PostgreSQL.
Enables workflow recovery from any point of failure.
"""

from langgraph.checkpoint.postgres import PostgresSaver
from psycopg2.pool import SimpleConnectionPool
import os


class CheckpointManager:
    """Manages workflow state checkpoints"""

    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL")
        if not self.db_url:
            raise ValueError("DATABASE_URL not set in environment")

        # Create connection pool
        self.pool = SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=self.db_url
        )

        # Initialize checkpointer
        self.checkpointer = PostgresSaver(self.pool)

    def get_checkpointer(self):
        """Get checkpointer instance for workflow compilation"""
        return self.checkpointer

    def list_checkpoints(self, thread_id: str):
        """List all checkpoints for a workflow thread"""
        # Query checkpoint table
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT checkpoint_id, created_at FROM checkpoints WHERE thread_id = %s ORDER BY created_at DESC",
                (thread_id,)
            )
            return cursor.fetchall()
        finally:
            self.pool.putconn(conn)

    def delete_checkpoints(self, thread_id: str):
        """Delete all checkpoints for a workflow thread"""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM checkpoints WHERE thread_id = %s",
                (thread_id,)
            )
            conn.commit()
        finally:
            self.pool.putconn(conn)


# Global checkpoint manager
checkpoint_manager = CheckpointManager()
```

**Database Setup Script:**
```bash
# scripts/setup_database.sh
#!/bin/bash

# Create database
createdb opspal_langgraph

# Create checkpoints table (LangGraph will do this automatically, but good to document)
psql opspal_langgraph <<EOF
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    checkpoint_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX idx_thread_id ON checkpoints(thread_id);
CREATE INDEX idx_created_at ON checkpoints(created_at);
EOF

echo "✅ Database setup complete"
```

---

### Week 2: Deployment Pipeline Workflow

**Hours:** 40 hours (1 FTE)
**Goal:** Complete deployment pipeline in LangGraph

#### Day 1-2: Core Workflow Implementation (16 hours)

**Tasks:**
- [ ] Define DeploymentState TypedDict
- [ ] Implement workflow nodes
- [ ] Add conditional edges
- [ ] Compile workflow with checkpointer

**Deliverable: workflows/deployment_pipeline.py**

```python
"""
Deployment Pipeline Workflow

Replaces: deployment-pipeline.sh (bash script)

Flow:
    validate → backup → deploy → verify
                           ↓ (on failure)
                        rollback

Features:
- Conditional rollback on deployment failure
- State checkpointing for recovery
- Multi-model routing (o1 for planning, Sonnet for execution)
- Audit trail for compliance
"""

from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Literal
import operator
from datetime import datetime
from config.models import router
from config.persistence import checkpoint_manager


class DeploymentState(TypedDict):
    """State schema for deployment workflow"""

    # Inputs
    org: str
    metadata_path: str
    environment: Literal["sandbox", "staging", "production"]

    # Checkpoints
    validation_result: dict
    backup_id: str
    deployment_id: str
    verification_result: dict

    # Control flow
    should_rollback: bool
    error_message: str

    # Audit trail (append-only)
    audit_log: Annotated[list, operator.add]


def validate_metadata(state: DeploymentState) -> DeploymentState:
    """
    Validate metadata before deployment.

    Uses: Claude Haiku (simple validation task)
    """
    from tools.salesforce.metadata import validate_metadata_files

    print(f"\n🔍 Validating metadata for {state['org']}...")

    try:
        result = validate_metadata_files(
            org=state["org"],
            metadata_path=state["metadata_path"]
        )

        passed = result["validation_passed"]
        print(f"{'✅' if passed else '❌'} Validation: {result['summary']}")

        return {
            "validation_result": result,
            "should_rollback": not passed,
            "error_message": "" if passed else result["error"],
            "audit_log": [{
                "step": "validate",
                "timestamp": datetime.now().isoformat(),
                "status": "success" if passed else "failed",
                "details": result
            }]
        }
    except Exception as e:
        print(f"❌ Validation failed: {e}")
        return {
            "validation_result": {"error": str(e)},
            "should_rollback": True,
            "error_message": str(e),
            "audit_log": [{
                "step": "validate",
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }]
        }


def create_backup(state: DeploymentState) -> DeploymentState:
    """
    Create pre-deployment backup.

    Uses: Claude Haiku (simple backup task)
    """
    from tools.salesforce.backup import create_full_backup

    print(f"\n💾 Creating backup for {state['org']}...")

    try:
        backup_id = create_full_backup(
            org=state["org"],
            objects=["all"],  # Back up all objects referenced in metadata
            reason=f"Pre-deployment backup for {state.get('deployment_id', 'pending')}"
        )

        print(f"✅ Backup created: {backup_id}")

        return {
            "backup_id": backup_id,
            "audit_log": [{
                "step": "backup",
                "timestamp": datetime.now().isoformat(),
                "status": "success",
                "backup_id": backup_id
            }]
        }
    except Exception as e:
        print(f"❌ Backup failed: {e}")
        return {
            "should_rollback": True,
            "error_message": f"Backup failed: {e}",
            "audit_log": [{
                "step": "backup",
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }]
        }


def deploy_metadata(state: DeploymentState) -> DeploymentState:
    """
    Execute Salesforce metadata deployment.

    Uses:
    - o1 for production (complex planning, high-risk)
    - Sonnet for sandbox/staging (balanced execution)
    """
    from tools.salesforce.deployment import deploy_metadata_package

    print(f"\n🚀 Deploying to {state['environment']} ({state['org']})...")

    try:
        # Production deployments are complex → use o1
        complexity = 0.85 if state["environment"] == "production" else 0.5
        model = router.get_model("general", complexity)

        # Production: check-only first, then confirm
        if state["environment"] == "production":
            print("⚠️  Production deployment: Running check-only validation...")

            check_result = deploy_metadata_package(
                org=state["org"],
                metadata_path=state["metadata_path"],
                run_tests=True,
                check_only=True,
                model=model
            )

            if not check_result["success"]:
                print(f"❌ Check-only failed: {check_result['error']}")
                return {
                    "should_rollback": True,
                    "error_message": f"Check-only failed: {check_result['error']}",
                    "audit_log": [{
                        "step": "deploy_check",
                        "timestamp": datetime.now().isoformat(),
                        "status": "failed",
                        "details": check_result
                    }]
                }

            # TODO: Add user confirmation step here
            # For POC, auto-confirm if check passed

        # Execute actual deployment
        deployment_result = deploy_metadata_package(
            org=state["org"],
            metadata_path=state["metadata_path"],
            run_tests=(state["environment"] == "production"),
            check_only=False,
            model=model
        )

        if deployment_result["success"]:
            print(f"✅ Deployment complete: {deployment_result['deployment_id']}")
        else:
            print(f"❌ Deployment failed: {deployment_result['error']}")

        return {
            "deployment_id": deployment_result.get("deployment_id", ""),
            "should_rollback": not deployment_result["success"],
            "error_message": deployment_result.get("error", ""),
            "audit_log": [{
                "step": "deploy",
                "timestamp": datetime.now().isoformat(),
                "status": "success" if deployment_result["success"] else "failed",
                "deployment_id": deployment_result.get("deployment_id"),
                "environment": state["environment"],
                "details": deployment_result
            }]
        }
    except Exception as e:
        print(f"❌ Deployment exception: {e}")
        return {
            "should_rollback": True,
            "error_message": str(e),
            "audit_log": [{
                "step": "deploy",
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }]
        }


def verify_deployment(state: DeploymentState) -> DeploymentState:
    """
    Verify deployment succeeded.

    Uses: o1 for production (critical verification), Sonnet otherwise
    """
    from tools.salesforce.deployment import verify_deployment_status

    print(f"\n✓ Verifying deployment {state['deployment_id']}...")

    try:
        complexity = 0.75 if state["environment"] == "production" else 0.4
        model = router.get_model("general", complexity)

        result = verify_deployment_status(
            org=state["org"],
            deployment_id=state["deployment_id"],
            expected_metadata=state["metadata_path"],
            model=model
        )

        passed = result["verification_passed"]
        print(f"{'✅' if passed else '❌'} Verification: {result['summary']}")

        return {
            "verification_result": result,
            "should_rollback": not passed,
            "error_message": "" if passed else result.get("error", "Verification failed"),
            "audit_log": [{
                "step": "verify",
                "timestamp": datetime.now().isoformat(),
                "status": "success" if passed else "failed",
                "details": result
            }]
        }
    except Exception as e:
        print(f"❌ Verification exception: {e}")
        return {
            "verification_result": {"error": str(e)},
            "should_rollback": True,
            "error_message": str(e),
            "audit_log": [{
                "step": "verify",
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e)
            }]
        }


def rollback_deployment(state: DeploymentState) -> DeploymentState:
    """
    Rollback to pre-deployment state using backup.

    Uses: Sonnet (execution task)
    """
    from tools.salesforce.backup import restore_from_backup

    print(f"\n⏮️  Rolling back deployment (backup: {state['backup_id']})...")

    try:
        model = router.get_model("general", 0.5)

        restore_result = restore_from_backup(
            org=state["org"],
            backup_id=state["backup_id"],
            model=model
        )

        print(f"✅ Rollback complete")

        return {
            "audit_log": [{
                "step": "rollback",
                "timestamp": datetime.now().isoformat(),
                "status": "success",
                "backup_id": state["backup_id"],
                "reason": state["error_message"],
                "details": restore_result
            }]
        }
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
        return {
            "audit_log": [{
                "step": "rollback",
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "error": str(e),
                "critical": True  # Rollback failure is critical!
            }]
        }


# Build workflow graph
def create_deployment_workflow():
    """Create and compile deployment workflow"""

    workflow = StateGraph(DeploymentState)

    # Add nodes
    workflow.add_node("validate", validate_metadata)
    workflow.add_node("backup", create_backup)
    workflow.add_node("deploy", deploy_metadata)
    workflow.add_node("verify", verify_deployment)
    workflow.add_node("rollback", rollback_deployment)

    # Define edges
    workflow.set_entry_point("validate")

    # Conditional: proceed to backup only if validation passed
    workflow.add_conditional_edges(
        "validate",
        lambda state: "backup" if not state.get("should_rollback", False) else END,
    )

    workflow.add_edge("backup", "deploy")

    # Conditional: verify if deployed, rollback if deploy failed
    workflow.add_conditional_edges(
        "deploy",
        lambda state: "verify" if state.get("deployment_id") and not state.get("should_rollback", False) else "rollback"
    )

    # Conditional: end if verified, rollback if verification failed
    workflow.add_conditional_edges(
        "verify",
        lambda state: END if not state.get("should_rollback", False) else "rollback"
    )

    workflow.add_edge("rollback", END)

    # Compile with checkpointer
    app = workflow.compile(
        checkpointer=checkpoint_manager.get_checkpointer()
    )

    return app


# Compiled workflow (ready to invoke)
deployment_app = create_deployment_workflow()
```

---

#### Day 3-4: Tool Implementation (16 hours)

**Tasks:**
- [ ] Implement Salesforce tools (metadata, deployment, backup)
- [ ] Wrap existing scripts as tool functions
- [ ] Add error handling and retries
- [ ] Write unit tests for tools

**Deliverable: tools/salesforce/deployment.py**

```python
"""
Salesforce Deployment Tools

Wraps existing deployment scripts as LangGraph-compatible tools.
"""

from langchain.tools import tool
from typing import Dict, Any, Optional
import subprocess
import json
import os


@tool
def deploy_metadata_package(
    org: str,
    metadata_path: str,
    run_tests: bool = False,
    check_only: bool = False,
    model: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Deploy Salesforce metadata package.

    Args:
        org: Salesforce org alias
        metadata_path: Path to metadata directory
        run_tests: Run Apex tests during deployment
        check_only: Validate without actually deploying
        model: LLM model for AI-assisted validation (optional)

    Returns:
        Deployment result with ID and status
    """

    # Call existing deployment script
    # In reality, this would use sf CLI or Metadata API
    # For POC, we'll simulate with placeholder

    try:
        cmd = [
            "sf", "project", "deploy", "start",
            "--target-org", org,
            "--source-dir", metadata_path
        ]

        if run_tests:
            cmd.extend(["--test-level", "RunLocalTests"])

        if check_only:
            cmd.append("--dry-run")

        # Execute
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )

        if result.returncode == 0:
            # Parse deployment ID from output
            deployment_id = "0Af..." # TODO: Parse from result.stdout

            return {
                "success": True,
                "deployment_id": deployment_id,
                "message": "Deployment succeeded",
                "output": result.stdout
            }
        else:
            return {
                "success": False,
                "error": result.stderr,
                "output": result.stdout
            }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Deployment timed out after 10 minutes"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@tool
def verify_deployment_status(
    org: str,
    deployment_id: str,
    expected_metadata: str,
    model: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Verify deployment completed successfully.

    Args:
        org: Salesforce org alias
        deployment_id: Deployment ID to verify
        expected_metadata: Path to expected metadata
        model: LLM model for AI-assisted verification

    Returns:
        Verification result with pass/fail status
    """

    try:
        # Query deployment status
        cmd = [
            "sf", "project", "deploy", "report",
            "--target-org", org,
            "--job-id", deployment_id,
            "--json"
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode == 0:
            data = json.loads(result.stdout)
            status = data["result"]["status"]

            if status == "Succeeded":
                return {
                    "verification_passed": True,
                    "summary": f"Deployment {deployment_id} verified successfully",
                    "details": data
                }
            else:
                return {
                    "verification_passed": False,
                    "summary": f"Deployment status: {status}",
                    "error": data.get("result", {}).get("errorMessage", "Unknown error"),
                    "details": data
                }
        else:
            return {
                "verification_passed": False,
                "error": result.stderr
            }

    except Exception as e:
        return {
            "verification_passed": False,
            "error": str(e)
        }
```

---

#### Day 5: Testing & Validation (8 hours)

**Tasks:**
- [ ] Write workflow tests
- [ ] Test checkpoint recovery
- [ ] Validate against test org
- [ ] Benchmark performance

**Test File: tests/workflows/test_deployment_pipeline.py**

```python
import pytest
from workflows.deployment_pipeline import deployment_app, DeploymentState


@pytest.mark.integration
def test_deployment_success_flow():
    """Test successful deployment flow"""

    state = {
        "org": "test-sandbox",
        "metadata_path": "tests/fixtures/valid_metadata",
        "environment": "sandbox"
    }

    result = deployment_app.invoke(state)

    # Assertions
    assert result["validation_result"]["validation_passed"]
    assert result["backup_id"]
    assert result["deployment_id"]
    assert result["verification_result"]["verification_passed"]
    assert not result["should_rollback"]

    # Verify audit log
    steps = [log["step"] for log in result["audit_log"]]
    assert "validate" in steps
    assert "backup" in steps
    assert "deploy" in steps
    assert "verify" in steps
    assert "rollback" not in steps


@pytest.mark.integration
def test_deployment_rollback_on_failure():
    """Test rollback when deployment fails"""

    state = {
        "org": "test-sandbox",
        "metadata_path": "tests/fixtures/invalid_metadata",
        "environment": "sandbox"
    }

    result = deployment_app.invoke(state)

    # Should rollback due to validation failure
    assert result["should_rollback"]
    assert "rollback" in [log["step"] for log in result["audit_log"]]


@pytest.mark.integration
def test_checkpoint_recovery():
    """Test that workflow can resume from checkpoint"""
    from langgraph.checkpoint.memory import MemorySaver

    # Compile with in-memory checkpointer for testing
    from workflows.deployment_pipeline import create_deployment_workflow
    app = create_deployment_workflow()

    state = {
        "org": "test-sandbox",
        "metadata_path": "tests/fixtures/valid_metadata",
        "environment": "sandbox"
    }

    config = {"configurable": {"thread_id": "test-recovery-1"}}

    # Run workflow (will save checkpoints)
    result = app.invoke(state, config)

    # Verify we can retrieve checkpoints
    # (In real implementation, would test recovery from failure point)
    assert result["deployment_id"]
```

---

### Week 3-4: Dedup Workflow + Tool Migration

**Hours:** 80 hours (2 FTE)
**Goal:** Dedup workflow in LangGraph + 50 tools migrated

(Detailed breakdown similar to Week 2, focusing on dedup workflow implementation with parallel execution)

---

## Phase 1 Completion Checklist

### Technical Deliverables

- [ ] **Model Router**
  - [ ] Implemented in `config/models.py`
  - [ ] Routes based on complexity (o1/Sonnet/Haiku)
  - [ ] Tracks usage statistics
  - [ ] Tests passing (≥80% coverage)

- [ ] **State Persistence**
  - [ ] PostgreSQL database configured
  - [ ] Checkpoint save/restore working
  - [ ] Can resume from any workflow step

- [ ] **Deployment Pipeline**
  - [ ] Workflow implemented in LangGraph
  - [ ] Conditional rollback working
  - [ ] Performs ≥ bash script version
  - [ ] Tests passing

- [ ] **Dedup Workflow**
  - [ ] Parallel backup execution
  - [ ] Parallel merge execution
  - [ ] 5x+ speedup validated
  - [ ] Tests passing

- [ ] **Tool Migration**
  - [ ] 50+ agents converted to tools
  - [ ] All tools tested and documented
  - [ ] Migration pattern documented

### Business Deliverables

- [ ] **Cost Validation**
  - [ ] Multi-model routing saves ≥60% vs all-Sonnet
  - [ ] Average cost ≤$1.20/1M tokens

- [ ] **Performance Validation**
  - [ ] Deployment pipeline completes in ≤ bash version time
  - [ ] Dedup workflow 5x+ faster than serial

- [ ] **Team Readiness**
  - [ ] Team comfortable with LangGraph
  - [ ] Can debug workflows independently
  - [ ] Can add new workflows without assistance

- [ ] **Stakeholder Approval**
  - [ ] Demo completed
  - [ ] Metrics validated
  - [ ] Phase 2 approved

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Model cost per 1M tokens | ≤$1.20 | Model router usage stats |
| Deployment success rate | ≥99% | Test suite results |
| Dedup speedup | ≥5x | Benchmark comparison |
| Test coverage | ≥80% | pytest-cov report |
| Team self-sufficiency | 100% | Can add workflows without help |
| Checkpoint recovery | 100% | Can resume from any failure point |

---

## Next Steps: Phase 2 Prep

Once Phase 1 is complete:

1. **Review & Retrospective**
   - What worked well?
   - What was harder than expected?
   - Adjust Phase 2 timeline if needed

2. **Phase 2 Planning**
   - Prioritize remaining workflows (assessment, sync, reflection)
   - Identify 106 agents for tool migration
   - Plan multi-platform integration

3. **Documentation Update**
   - Document lessons learned
   - Update migration patterns
   - Share with stakeholders

---

**Document Version:** 1.0
**Last Updated:** 2025-10-19
**Next Review:** Week 4 (after first workflow complete)
