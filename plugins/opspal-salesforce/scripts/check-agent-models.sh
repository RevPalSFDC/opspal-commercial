#!/bin/bash
for file in *.md; do
  if [[ "$file" != *"backup"* ]] && [[ "$file" != *"old"* ]]; then
    model=$(grep "^model:" "$file" 2>/dev/null | awk '{print $2}')
    if [ -n "$model" ]; then
      echo "$file: $model"
    else
      echo "$file: DEFAULT (sonnet)"
    fi
  fi
done | sort
