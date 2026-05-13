-- ============================================
-- Migration 007: Tools, Checkpoints, Approvals, ReAct
-- ============================================

-- Tool registry (admin tracking)
CREATE TABLE IF NOT EXISTS tool_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'MODERATE',
    needs_approval BOOLEAN DEFAULT 0,
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tool_registry(category);
CREATE INDEX IF NOT EXISTS idx_tools_risk ON tool_registry(risk_level);

-- Tool invocation audit log
CREATE TABLE IF NOT EXISTS tool_invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER,
    conversation_id INTEGER,
    user_id TEXT NOT NULL,
    server_id INTEGER,
    tool_name TEXT NOT NULL,
    tool_args TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    approved_by TEXT,
    result_summary TEXT,
    success BOOLEAN,
    duration_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_user ON tool_invocations(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool ON tool_invocations(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_created ON tool_invocations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_server ON tool_invocations(server_id);

-- Git checkpoints
CREATE TABLE IF NOT EXISTS git_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    execution_id INTEGER,
    conversation_id INTEGER,
    user_id TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    affected_paths TEXT,
    tool_name TEXT,
    risk_level TEXT,
    status TEXT DEFAULT 'active',
    rolled_back_at DATETIME,
    rolled_back_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_server ON git_checkpoints(server_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_execution ON git_checkpoints(execution_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON git_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON git_checkpoints(created_at DESC);

-- Approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    execution_id INTEGER,
    conversation_id INTEGER,
    user_id TEXT NOT NULL,
    server_id INTEGER,
    tool_name TEXT NOT NULL,
    tool_args TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    reason TEXT,
    ai_reasoning TEXT,
    status TEXT DEFAULT 'pending',
    decision_by TEXT,
    decision_at DATETIME,
    decision_reason TEXT,
    telegram_message_id TEXT,
    telegram_chat_id TEXT,
    webhook_sent BOOLEAN DEFAULT 0,
    websocket_notified BOOLEAN DEFAULT 0,
    timeout_minutes INTEGER DEFAULT 30,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approval_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_expires ON approval_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_approvals_created ON approval_requests(created_at DESC);

-- Approval notification delivery log
CREATE TABLE IF NOT EXISTS approval_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    approval_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    channel_message_id TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered BOOLEAN DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_notif_approval ON approval_notifications(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_notif_channel ON approval_notifications(channel);

-- ReAct execution tracking
CREATE TABLE IF NOT EXISTS react_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_id TEXT NOT NULL,
    server_id INTEGER,
    user_request TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    total_iterations INTEGER DEFAULT 0,
    max_iterations INTEGER DEFAULT 10,
    final_answer TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    total_duration_ms INTEGER,
    total_tokens_used INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_react_executions_user ON react_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_react_executions_status ON react_executions(status);
CREATE INDEX IF NOT EXISTS idx_react_executions_started ON react_executions(started_at DESC);

-- ReAct iteration tracking
CREATE TABLE IF NOT EXISTS react_iterations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL,
    iteration_number INTEGER NOT NULL,
    phase TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_name TEXT,
    tool_args TEXT,
    tool_result TEXT,
    success BOOLEAN,
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_react_iterations_execution ON react_iterations(execution_id);
CREATE INDEX IF NOT EXISTS idx_react_iterations_phase ON react_iterations(phase);

-- RAG snapshot tracking
CREATE TABLE IF NOT EXISTS rag_server_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    collection_type TEXT NOT NULL,
    snapshot_hash TEXT,
    chunk_count INTEGER DEFAULT 0,
    last_collected_at DATETIME NOT NULL,
    collection_duration_ms INTEGER,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rag_snapshots_server ON rag_server_snapshots(server_id);
CREATE INDEX IF NOT EXISTS idx_rag_snapshots_type ON rag_server_snapshots(collection_type);
CREATE INDEX IF NOT EXISTS idx_rag_snapshots_collected ON rag_server_snapshots(last_collected_at DESC);

-- RAG query log
CREATE TABLE IF NOT EXISTS rag_query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    server_id INTEGER,
    query TEXT NOT NULL,
    results_count INTEGER,
    top_similarity_score REAL,
    response_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rag_queries_user ON rag_query_log(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_queries_created ON rag_query_log(created_at DESC);
