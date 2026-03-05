# Phase Templates

## Standard Implementation Phases

### Phase 1: Discovery & Planning
**Duration**: 1-2 weeks
**Output**: Approved implementation plan

```yaml
Tasks:
  - title: Requirements gathering
    subtasks:
      - Document current state
      - Identify stakeholders
      - Collect use cases
      - Define success criteria

  - title: Technical assessment
    subtasks:
      - Review existing systems
      - Identify integration points
      - Assess data quality
      - Document constraints

  - title: Solution design
    subtasks:
      - Create architecture diagram
      - Define data model changes
      - Plan automation flows
      - Document security requirements

  - title: Plan approval
    subtasks:
      - Review with stakeholders
      - Address feedback
      - Get sign-off
      - Create timeline
```

### Phase 2: Development
**Duration**: 2-6 weeks (varies by scope)
**Output**: Configured solution in sandbox

```yaml
Tasks:
  - title: Environment setup
    subtasks:
      - Create sandbox environment
      - Configure integrations
      - Set up version control
      - Establish deployment pipeline

  - title: Core development
    subtasks:
      - Implement data model changes
      - Build automation logic
      - Create UI customizations
      - Develop integrations

  - title: Unit testing
    subtasks:
      - Write test cases
      - Execute unit tests
      - Fix defects
      - Document results
```

### Phase 3: Testing & Validation
**Duration**: 1-2 weeks
**Output**: Tested, validated solution

```yaml
Tasks:
  - title: Integration testing
    subtasks:
      - Test data flows
      - Verify automation triggers
      - Check integrations
      - Validate calculations

  - title: User acceptance testing
    subtasks:
      - Create UAT scripts
      - Schedule UAT sessions
      - Track issues
      - Get UAT sign-off

  - title: Performance testing
    subtasks:
      - Load testing
      - Stress testing
      - Identify bottlenecks
      - Optimize as needed
```

### Phase 4: Deployment
**Duration**: 1-3 days
**Output**: Live solution in production

```yaml
Tasks:
  - title: Pre-deployment
    subtasks:
      - Final code review
      - Create deployment checklist
      - Schedule deployment window
      - Notify stakeholders

  - title: Deployment
    subtasks:
      - Deploy metadata
      - Run data migrations
      - Activate automations
      - Verify deployment

  - title: Post-deployment
    subtasks:
      - Smoke testing
      - Monitor for issues
      - Update documentation
      - Communicate completion
```

### Phase 5: Training & Adoption
**Duration**: 1-2 weeks
**Output**: Trained users, adoption metrics

```yaml
Tasks:
  - title: Documentation
    subtasks:
      - Create user guides
      - Document admin procedures
      - Build FAQ
      - Record training videos

  - title: Training delivery
    subtasks:
      - Schedule training sessions
      - Conduct live training
      - Provide self-service resources
      - Answer questions

  - title: Adoption monitoring
    subtasks:
      - Track usage metrics
      - Gather feedback
      - Address issues
      - Report on adoption
```

## Project Type Templates

### CRM Implementation
```yaml
Phases:
  1_discovery:
    duration: 2 weeks
    tasks:
      - Current process mapping
      - Data audit
      - Integration requirements
      - User interviews

  2_design:
    duration: 2 weeks
    tasks:
      - Object model design
      - Workflow design
      - Report requirements
      - Security model

  3_build:
    duration: 4 weeks
    tasks:
      - Custom objects/fields
      - Automation setup
      - Reports/dashboards
      - Integration development

  4_migrate:
    duration: 2 weeks
    tasks:
      - Data cleaning
      - Test migration
      - Full migration
      - Validation

  5_deploy:
    duration: 1 week
    tasks:
      - Production deployment
      - User training
      - Go-live support
```

### Integration Project
```yaml
Phases:
  1_requirements:
    duration: 1 week
    tasks:
      - API documentation review
      - Data mapping requirements
      - Sync frequency definition
      - Error handling requirements

  2_design:
    duration: 1 week
    tasks:
      - Integration architecture
      - Field mapping document
      - Error handling design
      - Monitoring design

  3_development:
    duration: 2 weeks
    tasks:
      - Authentication setup
      - API development
      - Data transformation
      - Error handling implementation

  4_testing:
    duration: 1 week
    tasks:
      - Unit testing
      - Integration testing
      - Load testing
      - Failover testing

  5_deployment:
    duration: 3 days
    tasks:
      - Production setup
      - Go-live monitoring
      - Documentation
```

### Data Migration
```yaml
Phases:
  1_assessment:
    duration: 1 week
    tasks:
      - Source data analysis
      - Target mapping
      - Quality assessment
      - Volume estimation

  2_preparation:
    duration: 1 week
    tasks:
      - Data cleansing rules
      - Transformation logic
      - Test data set
      - Rollback plan

  3_testing:
    duration: 2 weeks
    tasks:
      - Test migration
      - Data validation
      - Performance testing
      - User verification

  4_execution:
    duration: 1-3 days
    tasks:
      - Pre-migration backup
      - Execute migration
      - Post-migration validation
      - Issue resolution

  5_verification:
    duration: 1 week
    tasks:
      - Comprehensive validation
      - User sign-off
      - Archive source data
      - Documentation
```

## Milestone Templates

### Go/No-Go Milestones
```yaml
Planning_Complete:
  criteria:
    - Requirements signed off
    - Budget approved
    - Timeline accepted
    - Resources assigned

Development_Complete:
  criteria:
    - All features built
    - Unit tests passing
    - Code review complete
    - Documentation drafted

UAT_Complete:
  criteria:
    - All test cases executed
    - Critical bugs resolved
    - User sign-off obtained
    - Training materials ready

Go_Live:
  criteria:
    - Deployment checklist complete
    - Rollback plan tested
    - Support team briefed
    - Communication sent
```
