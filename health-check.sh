#!/bin/bash

###############################################################################
# VPS DevOps Agent - Health Check & Auto-Repair Script
# Version: 1.0.0
# Description: Automatic health monitoring and error correction
###############################################################################

PROJECT_DIR="/opt/vps-devops-agent"
LOG_FILE="/var/log/vps-devops-agent-health.log"
ALERT_EMAIL=""  # Configure if needed

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[ℹ]${NC} $1" | tee -a "$LOG_FILE"
}

###############################################################################
# CHECK FUNCTIONS
###############################################################################

# Check 1: PM2 Service Status
check_pm2_service() {
    log_info "Checking PM2 service status..."
    
    if ! pm2 list | grep -q "vps-devops-agent"; then
        log_error "PM2 service not found!"
        return 1
    fi
    
    if pm2 list | grep "vps-devops-agent" | grep -q "errored\|stopped"; then
        log_error "PM2 service is not running properly"
        return 1
    fi
    
    log_success "PM2 service is running"
    return 0
}

# Check 2: Port 4000 Availability
check_port() {
    log_info "Checking port 4000..."
    
    if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:4000 | grep -q "200\|302"; then
        log_error "Port 4000 is not responding"
        return 1
    fi
    
    log_success "Port 4000 is accessible"
    return 0
}

# Check 3: Database Connectivity
check_database() {
    log_info "Checking database..."
    
    if [ ! -f "$PROJECT_DIR/data/devops-agent.db" ]; then
        log_error "Database file not found"
        return 1
    fi
    
    log_success "Database file exists"
    return 0
}

# Check 4: Frontend Files
check_frontend_files() {
    log_info "Checking frontend files..."
    
    local missing_files=()
    local required_files=(
        "$PROJECT_DIR/frontend/dashboard.html"
        "$PROJECT_DIR/frontend/monitoring.html"
        "$PROJECT_DIR/frontend/cicd.html"
        "$PROJECT_DIR/frontend/ai-agent-chat.html"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$(basename $file)")
        fi
    done
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        log_error "Missing files: ${missing_files[*]}"
        return 1
    fi
    
    log_success "All frontend files present"
    return 0
}

# Check 5: PM2 Logs for Errors
check_pm2_errors() {
    log_info "Checking recent PM2 errors..."
    
    local error_count=$(pm2 logs vps-devops-agent --nostream --lines 50 | grep -i "error\|exception" | wc -l)
    
    if [ $error_count -gt 10 ]; then
        log_warning "High error count in logs: $error_count errors in last 50 lines"
        return 1
    fi
    
    log_success "Error count acceptable: $error_count errors"
    return 0
}

# Check 6: Memory Usage
check_memory() {
    log_info "Checking memory usage..."
    
    local mem_percent=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    
    if [ $mem_percent -gt 90 ]; then
        log_error "Memory usage too high: ${mem_percent}%"
        return 1
    elif [ $mem_percent -gt 80 ]; then
        log_warning "Memory usage high: ${mem_percent}%"
        return 1
    fi
    
    log_success "Memory usage OK: ${mem_percent}%"
    return 0
}

# Check 7: Disk Space
check_disk() {
    log_info "Checking disk space..."
    
    local disk_percent=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ $disk_percent -gt 90 ]; then
        log_error "Disk usage critical: ${disk_percent}%"
        return 1
    elif [ $disk_percent -gt 80 ]; then
        log_warning "Disk usage high: ${disk_percent}%"
        return 1
    fi
    
    log_success "Disk usage OK: ${disk_percent}%"
    return 0
}

###############################################################################
# REPAIR FUNCTIONS
###############################################################################

# Repair 1: Restart PM2 Service
repair_pm2_service() {
    log_info "Attempting to repair PM2 service..."
    
    pm2 restart vps-devops-agent
    sleep 3
    
    if check_pm2_service; then
        log_success "PM2 service repaired successfully"
        return 0
    else
        log_error "Failed to repair PM2 service"
        return 1
    fi
}

# Repair 2: Clear PM2 Logs
repair_clear_logs() {
    log_info "Clearing PM2 logs..."
    
    pm2 flush vps-devops-agent
    
    log_success "PM2 logs cleared"
    return 0
}

# Repair 3: Fix Dashboard HTML
repair_dashboard_html() {
    log_info "Checking dashboard.html for corruption..."
    
    # Simple check: verify file is valid HTML
    if ! grep -q "</html>" "$PROJECT_DIR/frontend/dashboard.html"; then
        log_error "Dashboard HTML is corrupted!"
        
        # Restore from backup if exists
        if [ -f "$PROJECT_DIR/frontend/.backup/dashboard.html" ]; then
            cp "$PROJECT_DIR/frontend/.backup/dashboard.html" "$PROJECT_DIR/frontend/dashboard.html"
            log_success "Dashboard restored from backup"
            return 0
        else
            log_error "No backup available"
            return 1
        fi
    fi
    
    log_success "Dashboard HTML is valid"
    return 0
}

# Repair 4: Clean old PM2 processes
repair_clean_pm2() {
    log_info "Cleaning zombie PM2 processes..."
    
    pm2 delete all
    pm2 save --force
    pm2 resurrect
    
    log_success "PM2 processes cleaned"
    return 0
}

###############################################################################
# MAIN HEALTH CHECK ROUTINE
###############################################################################

run_health_check() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║    VPS DevOps Agent - Health Check & Auto-Repair             ║"
    echo "║    $(date '+%Y-%m-%d %H:%M:%S')                              ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    
    local failed_checks=()
    local total_checks=7
    local passed_checks=0
    
    # Run all checks
    if check_pm2_service; then ((passed_checks++)); else failed_checks+=("PM2_SERVICE"); fi
    if check_port; then ((passed_checks++)); else failed_checks+=("PORT"); fi
    if check_database; then ((passed_checks++)); else failed_checks+=("DATABASE"); fi
    if check_frontend_files; then ((passed_checks++)); else failed_checks+=("FRONTEND"); fi
    if check_pm2_errors; then ((passed_checks++)); else failed_checks+=("ERRORS"); fi
    if check_memory; then ((passed_checks++)); else failed_checks+=("MEMORY"); fi
    if check_disk; then ((passed_checks++)); else failed_checks+=("DISK"); fi
    
    # Calculate health score
    local health_score=$(( (passed_checks * 100) / total_checks ))
    
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    if [ $health_score -ge 90 ]; then
        echo -e "║  ${GREEN}Health Score: ${health_score}/100 - EXCELLENT${NC}                        ║"
    elif [ $health_score -ge 70 ]; then
        echo -e "║  ${BLUE}Health Score: ${health_score}/100 - GOOD${NC}                             ║"
    elif [ $health_score -ge 50 ]; then
        echo -e "║  ${YELLOW}Health Score: ${health_score}/100 - FAIR${NC}                             ║"
    else
        echo -e "║  ${RED}Health Score: ${health_score}/100 - POOR${NC}                             ║"
    fi
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Auto-repair failed checks
    if [ ${#failed_checks[@]} -gt 0 ]; then
        echo "🔧 AUTO-REPAIR MODE ACTIVATED"
        echo ""
        
        for check in "${failed_checks[@]}"; do
            case $check in
                PM2_SERVICE)
                    repair_pm2_service
                    ;;
                ERRORS)
                    repair_clear_logs
                    ;;
                FRONTEND)
                    repair_dashboard_html
                    ;;
            esac
        done
        
        echo ""
        log_info "Running verification check after repairs..."
        sleep 2
        
        # Recheck
        if check_pm2_service && check_port; then
            log_success "System repaired successfully!"
        else
            log_error "Some issues persist. Manual intervention required."
        fi
    fi
    
    echo ""
    echo "✨ Health check completed at $(date '+%H:%M:%S')"
    echo "📊 Score: ${passed_checks}/${total_checks} checks passed"
    echo ""
}

###############################################################################
# SCHEDULED MONITORING MODE
###############################################################################

run_continuous_monitoring() {
    log_info "Starting continuous monitoring mode..."
    
    while true; do
        run_health_check
        
        # Sleep for 5 minutes
        sleep 300
    done
}

###############################################################################
# SCRIPT EXECUTION
###############################################################################

case "${1:-check}" in
    check)
        run_health_check
        ;;
    monitor)
        run_continuous_monitoring
        ;;
    repair)
        log_info "Manual repair mode activated"
        repair_pm2_service
        repair_clear_logs
        repair_dashboard_html
        ;;
    *)
        echo "Usage: $0 {check|monitor|repair}"
        echo ""
        echo "  check   - Run single health check with auto-repair"
        echo "  monitor - Run continuous monitoring (every 5 minutes)"
        echo "  repair  - Force all repairs"
        exit 1
        ;;
esac
