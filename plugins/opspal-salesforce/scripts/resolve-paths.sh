#!/bin/bash

# Path Resolution Functions for SFDC Agents
# Provides consistent path resolution across all agents
# Created: 2025-09-11

# Base paths - relative to project root
PROJECT_ROOT="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
SFDC_BASE="$PROJECT_ROOT/platforms/SFDC"
INSTANCES_BASE="$SFDC_BASE/instances"
CURRENT_INSTANCE_FILE="$SFDC_BASE/.current-instance"

# Function to get the current instance name
getCurrentInstance() {
    if [ -f "$CURRENT_INSTANCE_FILE" ]; then
        cat "$CURRENT_INSTANCE_FILE"
    else
        # Try to detect from current directory
        if pwd | grep -q "platforms/SFDC/instances/"; then
            pwd | sed 's|.*/platforms/SFDC/instances/||' | cut -d'/' -f1
        else
            echo ""
        fi
    fi
}

# Function to set the current instance
setCurrentInstance() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        echo "Error: Instance name required" >&2
        return 1
    fi
    
    if [ ! -d "$INSTANCES_BASE/$instance_name" ]; then
        echo "Error: Instance not found: $instance_name" >&2
        return 1
    fi
    
    echo "$instance_name" > "$CURRENT_INSTANCE_FILE"
    echo "Current instance set to: $instance_name"
}

# Function to get the instance path
getInstancePath() {
    local instance_name="${1:-$(getCurrentInstance)}"
    if [ -z "$instance_name" ]; then
        echo "Error: No instance specified or current instance set" >&2
        return 1
    fi
    echo "$INSTANCES_BASE/$instance_name"
}

# Function to get the force-app path for an instance
getForceAppPath() {
    local instance_name="${1:-$(getCurrentInstance)}"
    local instance_path=$(getInstancePath "$instance_name")
    if [ $? -ne 0 ]; then
        return 1
    fi
    echo "$instance_path/force-app"
}

# Function to list all instances
listInstances() {
    if [ -d "$INSTANCES_BASE" ]; then
        ls -1 "$INSTANCES_BASE" | grep -v "^\." | while read instance; do
            if [ -d "$INSTANCES_BASE/$instance" ]; then
                if [ "$instance" = "$(getCurrentInstance)" ]; then
                    echo "* $instance (current)"
                else
                    echo "  $instance"
                fi
            fi
        done
    else
        echo "No instances directory found"
    fi
}

# Function to validate instance exists
validateInstance() {
    local instance_name="$1"
    if [ -z "$instance_name" ]; then
        return 1
    fi
    
    if [ -d "$INSTANCES_BASE/$instance_name" ]; then
        return 0
    else
        return 1
    fi
}

# Function to ensure we're in an instance directory
ensureInInstance() {
    local current_dir=$(pwd)
    if ! echo "$current_dir" | grep -q "platforms/SFDC/instances/"; then
        local instance=$(getCurrentInstance)
        if [ -n "$instance" ]; then
            cd "$(getInstancePath "$instance")"
            echo "Switched to instance: $instance"
        else
            echo "Error: Not in an instance directory and no current instance set" >&2
            return 1
        fi
    fi
}

# Function to get relative path from instance root
getRelativeFromInstance() {
    local full_path="$1"
    local instance_name="${2:-$(getCurrentInstance)}"
    local instance_path=$(getInstancePath "$instance_name")
    
    if [ $? -eq 0 ]; then
        echo "$full_path" | sed "s|^$instance_path/||"
    else
        echo "$full_path"
    fi
}

# Function to switch to instance directory
switchToInstance() {
    local instance_name="$1"
    if validateInstance "$instance_name"; then
        setCurrentInstance "$instance_name"
        cd "$(getInstancePath "$instance_name")"
        echo "Switched to instance: $instance_name"
        echo "Path: $(pwd)"
    else
        echo "Error: Invalid instance: $instance_name" >&2
        return 1
    fi
}

# Export functions for use in other scripts
export -f getCurrentInstance
export -f setCurrentInstance
export -f getInstancePath
export -f getForceAppPath
export -f listInstances
export -f validateInstance
export -f ensureInInstance
export -f getRelativeFromInstance
export -f switchToInstance

# If called directly, show current status
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    echo "SFDC Path Resolution Status"
    echo "============================"
    echo "Project Root: $PROJECT_ROOT"
    echo "SFDC Base: $SFDC_BASE"
    echo "Instances Base: $INSTANCES_BASE"
    echo ""
    echo "Current Instance: $(getCurrentInstance)"
    echo ""
    echo "Available Instances:"
    listInstances
fi