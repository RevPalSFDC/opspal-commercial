#!/usr/bin/env python3

"""
SOQL Helper for Salesforce MCP Tools
Provides Python-based SOQL query building, validation, and optimization
"""

import json
import re
from typing import List, Dict, Any, Optional, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, date, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AggregateFunction(Enum):
    """Supported SOQL aggregate functions"""
    COUNT = "COUNT"
    COUNT_DISTINCT = "COUNT_DISTINCT"
    SUM = "SUM"
    AVG = "AVG"
    MIN = "MIN"
    MAX = "MAX"


class OrderDirection(Enum):
    """Order by directions"""
    ASC = "ASC"
    DESC = "DESC"
    

class DateLiteral(Enum):
    """SOQL date literals"""
    YESTERDAY = "YESTERDAY"
    TODAY = "TODAY"
    TOMORROW = "TOMORROW"
    LAST_WEEK = "LAST_WEEK"
    THIS_WEEK = "THIS_WEEK"
    NEXT_WEEK = "NEXT_WEEK"
    LAST_MONTH = "LAST_MONTH"
    THIS_MONTH = "THIS_MONTH"
    NEXT_MONTH = "NEXT_MONTH"
    LAST_90_DAYS = "LAST_90_DAYS"
    NEXT_90_DAYS = "NEXT_90_DAYS"
    THIS_QUARTER = "THIS_QUARTER"
    LAST_QUARTER = "LAST_QUARTER"
    NEXT_QUARTER = "NEXT_QUARTER"
    THIS_YEAR = "THIS_YEAR"
    LAST_YEAR = "LAST_YEAR"
    NEXT_YEAR = "NEXT_YEAR"


@dataclass
class SelectField:
    """Represents a field in SELECT clause"""
    field: str
    alias: Optional[str] = None
    is_aggregate: bool = False
    function: Optional[AggregateFunction] = None


@dataclass
class WhereCondition:
    """Represents a WHERE condition"""
    condition: str
    operator: str = "AND"


@dataclass
class OrderByField:
    """Represents an ORDER BY field"""
    field: str
    direction: OrderDirection = OrderDirection.ASC


class SOQLHelper:
    """Python SOQL query builder and helper"""
    
    # Reserved SOQL keywords
    RESERVED_KEYWORDS = {
        'count', 'sum', 'avg', 'max', 'min', 'group', 'order', 'limit',
        'offset', 'having', 'rollup', 'cube', 'format', 'update', 'tracking',
        'viewstat', 'data', 'category', 'above', 'below', 'above_or_below',
        'at', 'end', 'first', 'last', 'not', 'null', 'nulls', 'or', 'and',
        'asc', 'desc', 'excludes', 'includes', 'like', 'in', 'true', 'false',
        'yesterday', 'today', 'tomorrow', 'last_week', 'this_week', 'next_week',
        'last_month', 'this_month', 'next_month', 'last_quarter', 'this_quarter',
        'next_quarter', 'last_year', 'this_year', 'next_year'
    }
    
    # Salesforce governor limits
    LIMITS = {
        'max_query_length': 100000,
        'max_where_clause_length': 4000,
        'max_records': 50000,
        'max_offset': 2000,
        'max_query_locator_rows': 10000,
        'max_aggregate_queries': 300,
        'max_distinct_count': 2000
    }
    
    def __init__(self):
        self.reset()
    
    def reset(self) -> 'SOQLHelper':
        """Reset the query builder to initial state"""
        self.select_fields: List[SelectField] = []
        self.from_object: Optional[str] = None
        self.where_conditions: List[WhereCondition] = []
        self.group_by_fields: List[str] = []
        self.having_conditions: List[str] = []
        self.order_by_fields: List[OrderByField] = []
        self.limit_value: Optional[int] = None
        self.offset_value: Optional[int] = None
        self.with_clauses: List[str] = []
        self.for_clauses: List[str] = []
        self.errors: List[str] = []
        self.warnings: List[str] = []
        return self
    
    def sanitize_alias(self, alias: str) -> str:
        """Sanitize alias to avoid reserved keyword conflicts"""
        if not alias:
            return None
            
        lower_alias = alias.lower()
        
        # If it's a reserved keyword, append suffix
        if lower_alias in self.RESERVED_KEYWORDS:
            return f"{alias}_value"
        
        # Ensure alias starts with letter and contains only valid characters
        sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', alias)
        if not re.match(r'^[a-zA-Z]', sanitized):
            sanitized = f"field_{sanitized}"
        
        return sanitized
    
    def select(self, fields: Union[str, List[str], Dict[str, str]]) -> 'SOQLHelper':
        """Add SELECT fields"""
        if isinstance(fields, str):
            self.select_fields.append(SelectField(field=fields))
        elif isinstance(fields, list):
            for field in fields:
                self.select_fields.append(SelectField(field=field))
        elif isinstance(fields, dict):
            for field, alias in fields.items():
                self.select_fields.append(
                    SelectField(field=field, alias=self.sanitize_alias(alias))
                )
        return self
    
    def aggregate(self, function: Union[str, AggregateFunction], 
                  field: Optional[str] = None, 
                  alias: Optional[str] = None) -> 'SOQLHelper':
        """Add aggregate function"""
        if isinstance(function, str):
            try:
                function = AggregateFunction[function.upper()]
            except KeyError:
                self.errors.append(f"Unknown aggregate function: {function}")
                return self
        
        # Generate automatic alias if not provided
        if not alias:
            if field:
                alias = f"{function.value.lower()}_{field.lower()}"
            else:
                alias = function.value.lower()
        
        alias = self.sanitize_alias(alias)
        
        # Build aggregate expression
        if function == AggregateFunction.COUNT and not field:
            field = "Id"
        
        if function == AggregateFunction.COUNT_DISTINCT:
            expression = f"COUNT_DISTINCT({field})"
        else:
            expression = f"{function.value}({field})" if field else function.value
        
        self.select_fields.append(
            SelectField(
                field=expression,
                alias=alias,
                is_aggregate=True,
                function=function
            )
        )
        return self
    
    def count(self, field: str = "Id", alias: str = None) -> 'SOQLHelper':
        """Shortcut for COUNT aggregate"""
        return self.aggregate(AggregateFunction.COUNT, field, alias or "recordCount")
    
    def sum(self, field: str, alias: str = None) -> 'SOQLHelper':
        """Shortcut for SUM aggregate"""
        return self.aggregate(AggregateFunction.SUM, field, alias or f"total_{field.lower()}")
    
    def avg(self, field: str, alias: str = None) -> 'SOQLHelper':
        """Shortcut for AVG aggregate"""
        return self.aggregate(AggregateFunction.AVG, field, alias or f"average_{field.lower()}")
    
    def from_object(self, object_name: str) -> 'SOQLHelper':
        """Set FROM object"""
        self.from_object = object_name
        return self
    
    def where(self, condition: str, operator: str = "AND") -> 'SOQLHelper':
        """Add WHERE condition"""
        if self.where_conditions:
            self.where_conditions.append(WhereCondition(condition, operator.upper()))
        else:
            self.where_conditions.append(WhereCondition(condition))
        return self
    
    def where_equals(self, field: str, value: Any) -> 'SOQLHelper':
        """Add equality condition"""
        formatted_value = self.format_value(value)
        return self.where(f"{field} = {formatted_value}")
    
    def where_in(self, field: str, values: List[Any]) -> 'SOQLHelper':
        """Add IN condition"""
        formatted_values = ", ".join(self.format_value(v) for v in values)
        return self.where(f"{field} IN ({formatted_values})")
    
    def where_like(self, field: str, pattern: str) -> 'SOQLHelper':
        """Add LIKE condition"""
        return self.where(f"{field} LIKE '{pattern}'")
    
    def where_date_range(self, field: str, start: Any, end: Any) -> 'SOQLHelper':
        """Add date range condition"""
        start_str = self.format_date(start)
        end_str = self.format_date(end)
        return self.where(f"{field} >= {start_str} AND {field} <= {end_str}")
    
    def where_date_literal(self, field: str, literal: DateLiteral) -> 'SOQLHelper':
        """Add date literal condition"""
        return self.where(f"{field} = {literal.value}")
    
    def group_by(self, fields: Union[str, List[str]]) -> 'SOQLHelper':
        """Add GROUP BY fields"""
        if isinstance(fields, str):
            self.group_by_fields.append(fields)
        else:
            self.group_by_fields.extend(fields)
        return self
    
    def having(self, condition: str) -> 'SOQLHelper':
        """Add HAVING condition"""
        self.having_conditions.append(condition)
        return self
    
    def order_by(self, field: str, direction: Union[str, OrderDirection] = OrderDirection.ASC) -> 'SOQLHelper':
        """Add ORDER BY field"""
        if isinstance(direction, str):
            try:
                direction = OrderDirection[direction.upper()]
            except KeyError:
                self.warnings.append(f"Invalid order direction: {direction}, using ASC")
                direction = OrderDirection.ASC
        
        self.order_by_fields.append(OrderByField(field, direction))
        return self
    
    def limit(self, value: int) -> 'SOQLHelper':
        """Set LIMIT"""
        if value > self.LIMITS['max_records']:
            self.warnings.append(f"LIMIT {value} exceeds maximum of {self.LIMITS['max_records']}")
            value = self.LIMITS['max_records']
        self.limit_value = value
        return self
    
    def offset(self, value: int) -> 'SOQLHelper':
        """Set OFFSET"""
        if value > self.LIMITS['max_offset']:
            self.warnings.append(f"OFFSET {value} exceeds maximum of {self.LIMITS['max_offset']}")
            value = self.LIMITS['max_offset']
        self.offset_value = value
        return self
    
    def with_security(self) -> 'SOQLHelper':
        """Add WITH SECURITY_ENFORCED clause"""
        self.with_clauses.append("WITH SECURITY_ENFORCED")
        return self
    
    def for_update(self) -> 'SOQLHelper':
        """Add FOR UPDATE clause"""
        self.for_clauses.append("FOR UPDATE")
        return self
    
    def for_view(self) -> 'SOQLHelper':
        """Add FOR VIEW clause"""
        self.for_clauses.append("FOR VIEW")
        return self
    
    def format_value(self, value: Any, field_type: str = None) -> str:
        """Format value for SOQL"""
        if value is None:
            return "null"
        
        # Check if value is a date string in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        date_pattern = r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$'
        if isinstance(value, str) and re.match(date_pattern, value):
            # Date values should NOT be quoted in SOQL
            return value
        
        # Check for date literals
        date_literals = {
            'YESTERDAY', 'TODAY', 'TOMORROW',
            'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
            'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
            'LAST_90_DAYS', 'NEXT_90_DAYS',
            'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
            'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR',
            'THIS_FISCAL_QUARTER', 'LAST_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER',
            'THIS_FISCAL_YEAR', 'LAST_FISCAL_YEAR', 'NEXT_FISCAL_YEAR'
        }
        
        if isinstance(value, str) and value.upper() in date_literals:
            # Date literals should NOT be quoted
            return value.upper()
        
        if isinstance(value, bool):
            return "true" if value else "false"
        
        if isinstance(value, str):
            # Regular strings need quotes and escaped single quotes
            escaped = value.replace("'", "\\'")
            return f"'{escaped}'"
        
        if isinstance(value, datetime):
            # Format datetime as ISO string without quotes
            return value.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        
        if isinstance(value, date):
            # Format date as YYYY-MM-DD without quotes
            return value.strftime("%Y-%m-%d")
        
        # Numbers don't need quotes
        return str(value)
    
    def format_date(self, date_value: Union[str, datetime, date]) -> str:
        """Format date for SOQL (without quotes)"""
        if isinstance(date_value, datetime):
            return date_value.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        if isinstance(date_value, date):
            return date_value.strftime("%Y-%m-%d")
        
        # Check if it's already in ISO format
        date_pattern = r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$'
        if isinstance(date_value, str) and re.match(date_pattern, date_value):
            return date_value
        
        # Check for date literals
        date_literals = {
            'YESTERDAY', 'TODAY', 'TOMORROW',
            'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
            'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
            'LAST_90_DAYS', 'NEXT_90_DAYS',
            'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
            'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR'
        }
        
        if date_value.upper() in date_literals:
            return date_value.upper()
        
        return date_value
    
    def validate(self) -> bool:
        """Validate the query"""
        self.errors = []
        self.warnings = []
        
        # Check required components
        if not self.select_fields:
            self.errors.append("No SELECT fields specified")
        
        if not self.from_object:
            self.errors.append("No FROM object specified")
        
        # Check aggregate/grouping consistency
        has_aggregates = any(f.is_aggregate for f in self.select_fields)
        has_non_aggregates = any(not f.is_aggregate for f in self.select_fields)
        
        if has_aggregates and has_non_aggregates and not self.group_by_fields:
            self.errors.append("Query with aggregates and non-aggregates requires GROUP BY")
        
        # Check HAVING without GROUP BY
        if self.having_conditions and not self.group_by_fields:
            self.errors.append("HAVING clause requires GROUP BY")
        
        # Check for duplicate aliases
        aliases = [f.alias for f in self.select_fields if f.alias]
        duplicates = [a for a in aliases if aliases.count(a) > 1]
        if duplicates:
            self.errors.append(f"Duplicate aliases found: {', '.join(set(duplicates))}")
        
        return len(self.errors) == 0
    
    def build(self) -> str:
        """Build the SOQL query string"""
        if not self.validate():
            raise ValueError(f"Query validation failed: {'; '.join(self.errors)}")
        
        parts = []
        
        # SELECT clause
        select_parts = []
        for field in self.select_fields:
            if field.alias:
                select_parts.append(f"{field.field} {field.alias}")
            else:
                select_parts.append(field.field)
        parts.append(f"SELECT {', '.join(select_parts)}")
        
        # FROM clause
        parts.append(f"FROM {self.from_object}")
        
        # WHERE clause
        if self.where_conditions:
            where_parts = []
            for i, condition in enumerate(self.where_conditions):
                if i == 0:
                    where_parts.append(condition.condition)
                else:
                    where_parts.append(f"{condition.operator} {condition.condition}")
            parts.append(f"WHERE {' '.join(where_parts)}")
        
        # GROUP BY clause
        if self.group_by_fields:
            parts.append(f"GROUP BY {', '.join(self.group_by_fields)}")
        
        # HAVING clause
        if self.having_conditions:
            parts.append(f"HAVING {' AND '.join(self.having_conditions)}")
        
        # ORDER BY clause
        if self.order_by_fields:
            order_parts = [f"{f.field} {f.direction.value}" for f in self.order_by_fields]
            parts.append(f"ORDER BY {', '.join(order_parts)}")
        
        # LIMIT clause
        if self.limit_value is not None:
            parts.append(f"LIMIT {self.limit_value}")
        
        # OFFSET clause
        if self.offset_value is not None:
            parts.append(f"OFFSET {self.offset_value}")
        
        # WITH clauses
        if self.with_clauses:
            parts.append(' '.join(self.with_clauses))
        
        # FOR clauses
        if self.for_clauses:
            parts.append(' '.join(self.for_clauses))
        
        query = ' '.join(parts)
        
        # Check query length
        if len(query) > self.LIMITS['max_query_length']:
            self.warnings.append(f"Query length ({len(query)}) exceeds maximum ({self.LIMITS['max_query_length']})")
        
        return query
    
    def build_paginated(self, page_size: int = 2000) -> List[Dict[str, Any]]:
        """Build paginated queries for large datasets"""
        queries = []
        offset = 0
        
        # Store original values
        original_limit = self.limit_value
        original_offset = self.offset_value
        
        self.limit_value = page_size
        
        while offset <= self.LIMITS['max_offset']:
            self.offset_value = offset
            
            try:
                query = self.build()
                queries.append({
                    'query': query,
                    'offset': offset,
                    'limit': page_size,
                    'page': len(queries) + 1
                })
            except ValueError as e:
                logger.error(f"Failed to build paginated query at offset {offset}: {e}")
                break
            
            offset += page_size
            
            # Stop if we've reached the original limit
            if original_limit and offset >= original_limit:
                break
        
        # Restore original values
        self.limit_value = original_limit
        self.offset_value = original_offset
        
        return queries
    
    def build_chunked_by_date(self, date_field: str = "CreatedDate", 
                              chunk_days: int = 30) -> List[Dict[str, Any]]:
        """Build chunked queries based on date ranges"""
        queries = []
        
        # Build query to get date range
        range_query = (SOQLHelper()
            .aggregate("MIN", date_field, "min_date")
            .aggregate("MAX", date_field, "max_date")
            .count()
            .from_object(self.from_object)
            .build())
        
        queries.append({
            'type': 'range_discovery',
            'query': range_query,
            'purpose': 'Get date range for chunking',
            'next_step': f'Use results to generate date-chunked queries with {chunk_days}-day chunks'
        })
        
        # Template for chunked queries
        queries.append({
            'type': 'chunk_template',
            'base_query': self.build(),
            'chunk_field': date_field,
            'chunk_days': chunk_days,
            'template': f"Add WHERE {date_field} >= START_DATE AND {date_field} < END_DATE to base query"
        })
        
        return queries
    
    @staticmethod
    def fix_malformed_query(query: str) -> str:
        """Attempt to fix a malformed SOQL query"""
        # Fix common reserved keyword issues
        replacements = [
            (r'\bCOUNT\(([^)]+)\)\s+count\b', r'COUNT(\1) recordCount'),
            (r'\bSUM\(([^)]+)\)\s+sum\b', r'SUM(\1) sum_value'),
            (r'\bAVG\(([^)]+)\)\s+avg\b', r'AVG(\1) avg_value'),
            (r'\bMAX\(([^)]+)\)\s+max\b', r'MAX(\1) max_value'),
            (r'\bMIN\(([^)]+)\)\s+min\b', r'MIN(\1) min_value'),
            (r'\bCOUNT\(([^)]+)\)\s+total\b', r'COUNT(\1) totalCount'),
            (r'\bSUM\(([^)]+)\)\s+total\b', r'SUM(\1) totalAmount'),
        ]
        
        fixed_query = query
        for pattern, replacement in replacements:
            fixed_query = re.sub(pattern, replacement, fixed_query, flags=re.IGNORECASE)
        
        # Fix date formatting issues - remove quotes around dates in YYYY-MM-DD format
        # Match patterns like: DateField = '2025-10-28' or DateField >= '2025-01-01T00:00:00Z'
        date_field_pattern = r"(\w+Date\w*|\w+_Date\w*|CreatedDate|LastModifiedDate|CloseDate|ActivityDate|StartDate|EndDate|BirthDate|ClosedDate|CompletedDateTime|SystemModstamp)\s*([=!<>]+)\s*'(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?)'"
        
        def fix_date(match):
            field = match.group(1)
            operator = match.group(2)
            date_value = match.group(3)
            # Remove quotes from date value
            return f"{field} {operator} {date_value}"
        
        fixed_query = re.sub(date_field_pattern, fix_date, fixed_query, flags=re.IGNORECASE)
        
        # Also fix date literals that might be incorrectly quoted
        date_literal_pattern = r"(\w+Date\w*|\w+_Date\w*|CreatedDate|LastModifiedDate|CloseDate|ActivityDate|StartDate|EndDate|BirthDate|ClosedDate|CompletedDateTime|SystemModstamp)\s*([=!<>]+)\s*'(TODAY|YESTERDAY|TOMORROW|LAST_WEEK|THIS_WEEK|NEXT_WEEK|LAST_MONTH|THIS_MONTH|NEXT_MONTH|LAST_90_DAYS|NEXT_90_DAYS|THIS_QUARTER|LAST_QUARTER|NEXT_QUARTER|THIS_YEAR|LAST_YEAR|NEXT_YEAR|THIS_FISCAL_QUARTER|LAST_FISCAL_QUARTER|NEXT_FISCAL_QUARTER|THIS_FISCAL_YEAR|LAST_FISCAL_YEAR|NEXT_FISCAL_YEAR)'"
        
        def fix_date_literal(match):
            field = match.group(1)
            operator = match.group(2)
            literal = match.group(3)
            # Remove quotes from date literal
            return f"{field} {operator} {literal}"
        
        fixed_query = re.sub(date_literal_pattern, fix_date_literal, fixed_query, flags=re.IGNORECASE)
        
        # Add missing aliases for aggregate functions without them
        pattern = r'\b(COUNT|SUM|AVG|MAX|MIN)\(([^)]+)\)(?!\s+\w+)(?=\s*,|\s+FROM)'
        
        def add_alias(match):
            func = match.group(1).lower()
            field = match.group(2)
            # Generate automatic alias
            if field.lower() == 'id' and func == 'count':
                alias = 'recordCount'
            else:
                alias = f"{func}_{field.lower().replace('.', '_')}"
            return f"{match.group(0)} {alias}"
        
        fixed_query = re.sub(pattern, add_alias, fixed_query, flags=re.IGNORECASE)
        
        return fixed_query
    
    @staticmethod
    def analyze_query_performance(query: str) -> Dict[str, Any]:
        """Analyze query for potential performance issues"""
        issues = []
        recommendations = []
        
        # Check for SELECT *
        if re.search(r'SELECT\s+\*', query, re.IGNORECASE):
            issues.append("SELECT * can impact performance")
            recommendations.append("Specify only required fields")
        
        # Check for missing WHERE clause
        if not re.search(r'\bWHERE\b', query, re.IGNORECASE):
            issues.append("No WHERE clause may return too many records")
            recommendations.append("Add WHERE clause to filter results")
        
        # Check for NOT operators
        if re.search(r'\bNOT\s+IN\b|\!=', query, re.IGNORECASE):
            issues.append("NOT operators can be inefficient")
            recommendations.append("Consider using positive conditions")
        
        # Check for wildcards at start of LIKE
        if re.search(r"LIKE\s+'%[^']+", query, re.IGNORECASE):
            issues.append("Leading wildcards in LIKE prevent index usage")
            recommendations.append("Avoid leading % in LIKE patterns")
        
        # Check for OR conditions
        or_count = len(re.findall(r'\bOR\b', query, re.IGNORECASE))
        if or_count > 3:
            issues.append(f"Multiple OR conditions ({or_count}) can impact performance")
            recommendations.append("Consider using IN clause or restructuring query")
        
        # Check for missing LIMIT
        if not re.search(r'\bLIMIT\b', query, re.IGNORECASE):
            issues.append("No LIMIT clause")
            recommendations.append("Add LIMIT to control result size")
        
        return {
            'issues': issues,
            'recommendations': recommendations,
            'performance_score': max(0, 100 - len(issues) * 20)
        }


# Common query templates
class QueryTemplates:
    """Pre-built query templates for common scenarios"""
    
    @staticmethod
    def record_count(object_name: str, where_clause: str = None) -> str:
        """Simple record count query"""
        query = SOQLHelper().count().from_object(object_name)
        if where_clause:
            query.where(where_clause)
        return query.build()
    
    @staticmethod
    def opportunity_pipeline(stage_field: str = "StageName") -> str:
        """Opportunity pipeline summary"""
        return (SOQLHelper()
            .select(stage_field)
            .count()
            .sum("Amount")
            .avg("Amount")
            .from_object("Opportunity")
            .where("IsClosed = false")
            .group_by(stage_field)
            .order_by("SUM(Amount)", OrderDirection.DESC)
            .build())
    
    @staticmethod
    def account_summary() -> str:
        """Account summary with revenue metrics"""
        return (SOQLHelper()
            .select("Type")
            .count()
            .sum("AnnualRevenue")
            .avg("NumberOfEmployees")
            .from_object("Account")
            .where("AnnualRevenue != null")
            .group_by("Type")
            .having("COUNT(Id) > 5")
            .order_by("SUM(AnnualRevenue)", OrderDirection.DESC)
            .build())
    
    @staticmethod
    def recent_records(object_name: str, days: int = 7, limit: int = 100) -> str:
        """Recent records from any object"""
        return (SOQLHelper()
            .select(["Id", "Name", "CreatedDate", "LastModifiedDate"])
            .from_object(object_name)
            .where_date_literal("CreatedDate", DateLiteral.LAST_WEEK)
            .order_by("CreatedDate", OrderDirection.DESC)
            .limit(limit)
            .build())
    
    @staticmethod
    def user_activity(user_field: str = "OwnerId") -> str:
        """User activity summary"""
        return (SOQLHelper()
            .select(user_field)
            .count()
            .aggregate("MAX", "LastModifiedDate", "last_activity")
            .from_object("Task")
            .where("Status = 'Completed'")
            .where_date_literal("CompletedDateTime", DateLiteral.THIS_MONTH)
            .group_by(user_field)
            .order_by("COUNT(Id)", OrderDirection.DESC)
            .limit(10)
            .build())


def main():
    """CLI interface for testing"""
    import sys
    
    if len(sys.argv) < 2:
        print("SOQL Helper - Python Query Builder\n")
        print("Usage: python soql_helper.py <command> [options]\n")
        print("Commands:")
        print("  fix <query>       - Fix a malformed query")
        print("  analyze <query>   - Analyze query performance")
        print("  template <name>   - Generate template query")
        print("  example          - Show usage examples")
        return
    
    command = sys.argv[1]
    
    if command == "fix":
        if len(sys.argv) < 3:
            print("Please provide a query to fix")
            return
        query = " ".join(sys.argv[2:])
        fixed = SOQLHelper.fix_malformed_query(query)
        print(f"Original: {query}")
        print(f"Fixed: {fixed}")
    
    elif command == "analyze":
        if len(sys.argv) < 3:
            print("Please provide a query to analyze")
            return
        query = " ".join(sys.argv[2:])
        analysis = SOQLHelper.analyze_query_performance(query)
        print(f"Performance Score: {analysis['performance_score']}/100")
        if analysis['issues']:
            print("\nIssues Found:")
            for issue in analysis['issues']:
                print(f"  - {issue}")
        if analysis['recommendations']:
            print("\nRecommendations:")
            for rec in analysis['recommendations']:
                print(f"  - {rec}")
    
    elif command == "template":
        if len(sys.argv) < 3:
            print("Available templates: record_count, opportunity_pipeline, account_summary, recent_records, user_activity")
            return
        template_name = sys.argv[2]
        templates = QueryTemplates()
        if hasattr(templates, template_name):
            query = getattr(templates, template_name)()
            print(f"Template: {template_name}")
            print(f"Query: {query}")
        else:
            print(f"Unknown template: {template_name}")
    
    elif command == "example":
        print("Example: Fix the original error")
        helper = SOQLHelper()
        query = (helper
            .count()
            .sum("Amount")
            .avg("Amount")
            .from_object("Opportunity")
            .build())
        print(f"Fixed query: {query}")
        
        print("\nExample: Complex aggregation")
        helper.reset()
        query = (helper
            .select("StageName")
            .count()
            .sum("Amount", "total_revenue")
            .avg("Probability", "avg_probability")
            .from_object("Opportunity")
            .where_date_literal("CloseDate", DateLiteral.THIS_QUARTER)
            .group_by("StageName")
            .having("COUNT(Id) > 10")
            .order_by("SUM(Amount)", OrderDirection.DESC)
            .limit(5)
            .build())
        print(f"Complex query: {query}")


if __name__ == "__main__":
    main()