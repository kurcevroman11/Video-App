#!/bin/sh
# Генерирует /etc/coturn/turnserver.conf из переменных окружения и запускает turnserver.
# Один и тот же конфиг-шаблон подходит и для локальной, и для прод среды:
# лок публикует только UDP без TLS, прод может включить TLS и указать внешний IP.
set -e

CONF=/etc/coturn/turnserver.conf

TURN_SHARED_SECRET="${TURN_SHARED_SECRET:?TURN_SHARED_SECRET is required}"
TURN_REALM="${TURN_REALM:-localhost}"
TURN_EXTERNAL_IP="${TURN_EXTERNAL_IP:-}"
TURN_TLS="${TURN_TLS:-off}"
TURN_TLS_CERT_DIR="${TURN_TLS_CERT_DIR:-/etc/letsencrypt/live/rkvideoapp.ru}"

umask 077
{
  echo "listening-port=3478"
  if [ "$TURN_TLS" = "on" ]; then
    echo "tls-listening-port=5349"
    echo "cert=$TURN_TLS_CERT_DIR/fullchain.pem"
    echo "pkey=$TURN_TLS_CERT_DIR/privkey.pem"
  fi
  # диапазон портов для релея медиатрафика
  echo "min-port=49152"
  echo "max-port=65535"
  # внешний IP (1:1 NAT): задаётся только в проде; пусто -> coturn сам определит адреса
  [ -n "$TURN_EXTERNAL_IP" ] && echo "external-ip=$TURN_EXTERNAL_IP"
  echo "realm=$TURN_REALM"
  echo "use-auth-secret"
  echo "static-auth-secret=$TURN_SHARED_SECRET"
  echo "fingerprint"
  echo "lt-cred-mech"
  # защита от открытого relay во внутреннюю сеть (RFC-стандартная рекомендация)
  echo "denied-peer-ip=10.0.0.0-10.255.255.255"
  echo "denied-peer-ip=172.16.0.0-172.31.255.255"
  echo "denied-peer-ip=192.168.0.0-192.168.255.255"
  echo "denied-peer-ip=127.0.0.0-127.255.255.255"
  echo "no-cli"
  echo "no-tcp-relay"
  echo "verbose"
} > "$CONF"

echo ">>> Generated $CONF (secret masked):"
sed 's/^static-auth-secret=.*/static-auth-secret=***/' "$CONF"

# Обходим зависающий detect-external-ip из entrypoint образа: запускаем turnserver напрямую.
exec turnserver --log-file=stdout