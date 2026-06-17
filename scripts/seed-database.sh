#!/usr/bin/env bash
# seed-database.sh - Seed development database with test data
# Usage: ./scripts/seed-database.sh

set -e

echo "🌱 Seeding TeamLens development database..."

# Check if running via docker-compose or local psql
if command -v docker-compose &> /dev/null; then
    DB_CMD="docker-compose -f docker-compose.dev.yml exec -T postgres psql -U teamlens -d teamlens_dev"
else
    DB_CMD="psql -U teamlens -d teamlens_dev"
fi

$DB_CMD << 'SEEDSQL'
-- Test Organization
INSERT INTO organizations (id, name, created_at, updated_at)
VALUES ('org_test_001', 'Test Organization', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Manager
INSERT INTO users (id, email, full_name, password_hash, role, organization_id, status, created_at, updated_at)
VALUES (
    'user_manager_001',
    'manager@test.com',
    'Test Manager',
    '$2a$10$DummyHashForManager', -- Not a real password, dev only
    'MANAGER',
    'org_test_001',
    'ACTIVE',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Test Employees
INSERT INTO users (id, email, full_name, password_hash, role, organization_id, status, created_at, updated_at)
VALUES
    ('user_emp_001', 'employee1@test.com', 'Test Employee One', '$2a$10$DummyHash', 'EMPLOYEE', 'org_test_001', 'ACTIVE', NOW(), NOW()),
    ('user_emp_002', 'employee2@test.com', 'Test Employee Two', '$2a$10$DummyHash', 'EMPLOYEE', 'org_test_001', 'ACTIVE', NOW(), NOW()),
    ('user_emp_003', 'employee3@test.com', 'Test Employee Three', '$2a$10$DummyHash', 'ADMIN', 'org_test_001', 'ACTIVE', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Test Team Memberships
INSERT INTO team_memberships (id, user_id, team_id, role, created_at)
VALUES
    ('tm_001', 'user_emp_001', 'team_default', 'MEMBER', NOW()),
    ('tm_002', 'user_emp_002', 'team_default', 'MEMBER', NOW()),
    ('tm_003', 'user_emp_003', 'team_default', 'LEAD', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Work Sessions
INSERT INTO work_sessions (id, user_id, start_time, end_time, total_duration, created_at, updated_at)
VALUES
    ('ws_001', 'user_emp_001', NOW() - INTERVAL '7 hours', NOW() - INTERVAL '2 hours', 18000, NOW(), NOW()),
    ('ws_002', 'user_emp_002', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour', 18000, NOW(), NOW()),
    ('ws_003', 'user_emp_001', NOW() - INTERVAL '6 hours', NULL, NULL, NOW(), NOW()) -- Currently active
ON CONFLICT (id) DO NOTHING;

-- Test Activity Logs
INSERT INTO activity_logs (id, user_id, action_type, description, timestamp, created_at)
VALUES
    ('al_001', 'user_emp_001', 'CLOCK_IN', 'Employee clocked in', NOW() - INTERVAL '7 hours', NOW()),
    ('al_002', 'user_emp_001', 'SCREENSHOT', 'Screenshot captured', NOW() - INTERVAL '6 hours', NOW()),
    ('al_003', 'user_emp_001', 'CLOCK_OUT', 'Employee clocked out', NOW() - INTERVAL '2 hours', NOW()),
    ('al_004', 'user_emp_002', 'CLOCK_IN', 'Employee clocked in', NOW() - INTERVAL '6 hours', NOW()),
    ('al_005', 'user_emp_003', 'CLOCK_IN', 'Manager clocked in', NOW() - INTERVAL '5 hours', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Agent Tokens
INSERT INTO agent_tokens (id, user_id, token, device_info, created_at, expires_at, last_used_at)
VALUES
    ('at_001', 'user_emp_001', 'dev_token_employee_1', 'Windows 11 / Chrome', NOW(), NOW() + INTERVAL '30 days', NOW()),
    ('at_002', 'user_emp_002', 'dev_token_employee_2', 'macOS / Safari', NOW(), NOW() + INTERVAL '30 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test Invites
INSERT INTO invites (id, email, role, organization_id, invited_by, token, status, expires_at, created_at)
VALUES
    ('inv_001', 'newemployee@test.com', 'EMPLOYEE', 'org_test_001', 'user_manager_001', 'invite_token_123', 'PENDING', NOW() + INTERVAL '3 days', NOW()),
    ('inv_002', 'newadmin@test.com', 'ADMIN', 'org_test_001', 'user_manager_001', 'invite_token_456', 'PENDING', NOW() + INTERVAL '3 days', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT 'Seed complete!' as status;
SEEDSQL

echo "✅ Database seeded successfully!"
echo ""
echo "Test accounts:"
echo "  Manager:  manager@test.com (role: MANAGER)"
echo "  Employee: employee1@test.com (role: EMPLOYEE)"
echo "  Employee: employee2@test.com (role: EMPLOYEE)"
echo "  Admin:    employee3@test.com (role: ADMIN)"
