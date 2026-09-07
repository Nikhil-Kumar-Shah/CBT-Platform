param (
    [Parameter(Position = 0)]
    [ValidateSet("init", "start", "stop", "status", "createdb", "restart")]
    [string]$Action = "status"
)

$PG_BIN = "C:\Program Files\PostgreSQL\18\bin"
$DATA_DIR = Join-Path $PSScriptRoot "..\.pgdata"
$LOG_FILE = Join-Path $PSScriptRoot "..\.pgdata\postgresql.log"
$PORT = 5433

if (-not (Test-Path $PG_BIN)) {
    Write-Error "PostgreSQL 18 binaries not found at $PG_BIN"
    exit 1
}

$initdb = Join-Path $PG_BIN "initdb.exe"
$pg_ctl = Join-Path $PG_BIN "pg_ctl.exe"
$createdb = Join-Path $PG_BIN "createdb.exe"

switch ($Action) {
    "init" {
        if (Test-Path $DATA_DIR) {
            Write-Host "Data directory already exists at $DATA_DIR"
        } else {
            Write-Host "Initializing PostgreSQL cluster in $DATA_DIR..."
            & $initdb -D $DATA_DIR -U postgres -A trust --encoding=UTF8
            Write-Host "Initialization complete."
        }
    }
    "start" {
        if (-not (Test-Path $DATA_DIR)) {
            Write-Host "Data directory not found. Initializing first..."
            & $initdb -D $DATA_DIR -U postgres -A trust --encoding=UTF8
        }
        Write-Host "Starting PostgreSQL on port $PORT..."
        & $pg_ctl -D $DATA_DIR -l $LOG_FILE -o "-p $PORT" start
        Start-Sleep -Seconds 2
        # Automatically create cbt_db if it doesn't exist
        & $createdb -U postgres -p $PORT cbt_db 2>$null
        Write-Host "PostgreSQL is running on port $PORT. Database 'cbt_db' ready."
    }
    "stop" {
        Write-Host "Stopping PostgreSQL..."
        & $pg_ctl -D $DATA_DIR stop
    }
    "restart" {
        Write-Host "Restarting PostgreSQL on port $PORT..."
        & $pg_ctl -D $DATA_DIR -l $LOG_FILE -o "-p $PORT" restart
    }
    "status" {
        & $pg_ctl -D $DATA_DIR status
    }
    "createdb" {
        Write-Host "Creating cbt_db database..."
        & $createdb -U postgres -p $PORT cbt_db
    }
}
