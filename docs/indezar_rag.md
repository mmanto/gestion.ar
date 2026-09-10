scp ~/workspace/bolivar/normas_corpus.jsonl mmanto@147.79.86.54:/tmp/
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  cp /tmp/normas_corpus.jsonl app:/tmp/normas_corpus.jsonl
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T app python scripts/index_bolivar_normas.py \
    --jsonl /tmp/normas_corpus.jsonl --bot-id bot_7b6946dceb98 --rag-results 5
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  restart app
