#!/bin/bash
# Script de Backup Diario para PostgreSQL
# Se recomienda correr mediante Crontab a las 23:59hs del servidor:
# 59 23 * * * /ruta/absoluta/scripts/backup.sh >> /var/log/pg_backup.log 2>&1

DB_CONTAINER_NAME="acme_db"
DB_USER="acme_admin"
DB_NAME="acme_finanzas"
BACKUP_DIR="./backups"
DATE=$(date +"%Y%m%d_%H%M%S")

echo "Iniciando Backup de la Base de Datos Acme..."
mkdir -p "$BACKUP_DIR"

# Ejecutamos pg_dump dentro del contenedor
docker exec "$DB_CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" -F c > "$BACKUP_DIR/acme_finanzas_$DATE.dump"

if [ $? -eq 0 ]; then
  echo "Backup completado exitosamente: $BACKUP_DIR/acme_finanzas_$DATE.dump"
  # Rotación: Borrar backups más antiguos a 30 días
  find "$BACKUP_DIR" -type f -name "*.dump" -mtime +30 -exec rm {} \;
  echo "Rotación de backups antiguos finalizada."
else
  echo "Hubo un error crítico al realizar el backup."
  exit 1
fi
