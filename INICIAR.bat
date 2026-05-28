@echo off
chcp 65001 > nul
title ENGECOM DSSMAC - Iniciando...
color 0A

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║     ENGECOM  3E  5G  —  DSSMAC Manager    ║
echo  ╚═══════════════════════════════════════════╝
echo.

:: Verifica se Node.js esta instalado
where node >nul 2>&1
if errorlevel 1 (
  color 0C
  echo  [ERRO] Node.js nao esta instalado!
  echo.
  echo  Siga os passos abaixo:
  echo.
  echo  1. Abra o navegador
  echo  2. Acesse:  https://nodejs.org
  echo  3. Clique em "Download Node.js (LTS)"
  echo  4. Instale normalmente (próximo, próximo, concluir)
  echo  5. Feche e abra este arquivo novamente
  echo.
  echo  Abrindo o site para download...
  start https://nodejs.org
  echo.
  pause
  exit
)

echo  [OK] Node.js encontrado:
node --version
echo.

:: Instala dependencias se necessario
if not exist "node_modules\" (
  echo  [INSTALANDO] Baixando dependencias... aguarde...
  echo  (isso so acontece na primeira vez)
  echo.
  call npm install
  if errorlevel 1 (
    color 0C
    echo.
    echo  [ERRO] Falha ao instalar dependencias.
    echo  Verifique sua conexao com a internet.
    pause
    exit
  )
  echo.
  echo  [OK] Dependencias instaladas com sucesso!
  echo.
)

:: Abre o navegador automaticamente
echo  [INICIANDO] Abrindo servidor...
start "" "http://localhost:3000"

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║  Sistema rodando em: http://localhost:3000 ║
echo  ║                                            ║
echo  ║  MANTENHA ESTA JANELA ABERTA!              ║
echo  ║  Para encerrar: feche esta janela.         ║
echo  ╚═══════════════════════════════════════════╝
echo.

node server.js

pause
