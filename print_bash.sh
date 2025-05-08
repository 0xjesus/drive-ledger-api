#!/bin/bash

# Directorio base
base_dir="$PWD"

# Archivos y directorios importantes a imprimir
important_paths=(
  "services"
  "controllers"
  "routes"
  "app.js"
  "prisma/schema.prisma"
  "tokens"
  "wallet"
)

echo "--- Contenido de archivos y directorios importantes ---"
echo ""

for path in "${important_paths[@]}"; do
  full_path="$base_dir/$path"
  if [ -f "$full_path" ]; then
    echo "--- Contenido de: $path ---"
    cat "$full_path"
    echo ""
  elif [ -d "$full_path" ]; then
    echo "--- Contenido de directorio: $path ---"
    find "$full_path" -type f -print0 | while IFS= read -r -d $'\0' file; do
      echo "--- Archivo en $path: $(basename "$file") ---"
      cat "$file"
      echo ""
    done
  else
    echo "Advertencia: No se encontró el path: $path"
    echo ""
  fi
done
