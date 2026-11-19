#!/bin/sh
# Verifica che orders sia leggibile via PostgREST con la sola header apikey.
# URL e secret key arrivano dall'ambiente e non vengono mai stampati.
#
#   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/verify-orders-read.sh
#
# Exit: 0 lettura ok | 1 lettura rifiutata | 2 configurazione mancante o non valida
set -u

url="${NEXT_PUBLIC_SUPABASE_URL:-}"
key="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$url" ] || [ -z "$key" ]; then
  echo "servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell'ambiente" >&2
  exit 2
fi
case "$key" in
  *'"'*) echo "la chiave contiene un doppio apice: non gestibile qui" >&2; exit 2 ;;
esac

endpoint="${url%/}/rest/v1/orders?select=id&limit=1"

# La chiave passa da stdin (curl -K -) e non dalla riga di comando: non compare in ps.
probe() {
  {
    printf 'header = "apikey: %s"\n' "$key"
    [ -n "$1" ] && printf '%s\n' "$1"
  } | curl -s -o /dev/null -w '%{http_code}' -K - "$endpoint"
}

apikey_only="$(probe "")"
apikey_bearer="$(probe "header = \"Authorization: Bearer $key\"")"

echo "orders, solo apikey:   HTTP $apikey_only"
echo "orders, apikey+Bearer: HTTP $apikey_bearer"

if [ "$apikey_only" != "200" ]; then
  echo "lettura fallita: controlla URL, chiave e policy RLS su orders" >&2
  exit 1
fi

if [ "$apikey_bearer" = "200" ]; then
  echo "nota: il Bearer e' ancora accettato, quindi la chiave sembra una legacy JWT e non una sb_secret_"
else
  echo "ok: il Bearer non e' accettato, comportamento atteso per una sb_secret_"
fi

exit 0
