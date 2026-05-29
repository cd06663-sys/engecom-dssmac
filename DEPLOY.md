# Deploy — ENGECOM DSSMAC

## Pré-requisitos já feitos
- [x] Código no GitHub: https://github.com/cd06663-sys/engecom-dssmac
- [x] Banco de dados no Supabase (projeto: qgiyhobvumwobxqxptol)
- [x] Bucket de arquivos "uploads" criado no Supabase Storage

## Como fazer o deploy (Railway)

### 1. Criar conta no Railway
Acesse https://railway.app → clique **"Login with GitHub"**

### 2. Criar projeto
- Clique **"New Project"**
- Selecione **"Deploy from GitHub repo"**
- Escolha o repositório `engecom-dssmac`

### 3. Adicionar variáveis de ambiente
No painel do Railway: serviço → aba **"Variables"** → adicione:

| Variável | Onde encontrar |
|----------|---------------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role key |

### 4. Gerar URL pública
No Railway: **Settings → Networking → Generate Domain**

### 5. Links das equipes
- Equipe 1: `https://sua-url.up.railway.app/equipe/1`
- Equipe 2: `https://sua-url.up.railway.app/equipe/2`
- ...até equipe 9

---

## Variáveis de ambiente (.env)
Veja o arquivo `.env.example` para o formato correto.
**Nunca commite o arquivo `.env` com senhas reais.**
