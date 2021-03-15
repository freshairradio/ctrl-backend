docker run -d \
    --name ctrl-backend \
    -p 0:7878 \
    -p 0:8432 \
    -p 0:8080 \
    -v $PWD/offair/eighties:/app/eighties \
    -v $PWD/recordings:/app/recordings \
    --network traefik-net \
    --label "traefik.enable=true" \
    --label "traefik.http.routers.streaming.rule=Host(\`stream.freshair.radio\`)" \
    --label "traefik.http.services.streaming-service.loadbalancer.server.port=7878" \
    --label "traefik.http.routers.streaming.entrypoints=websecure" \
    --label "traefik.http.routers.streaming.service=streaming-service" \
    --label "traefik.http.services.ctrl-service.loadbalancer.server.port=8432" \
    --label "traefik.http.routers.ctrl.entrypoints=websecure" \
    --label "traefik.http.routers.ctrl.service=ctrl-service" \
    --label "traefik.http.routers.ctrl.rule=Host(\`data.freshair.radio\`)" \
    --label "traefik.http.services.ws-service.loadbalancer.server.port=8432" \
    --label "traefik.http.routers.ws.entrypoints=websecure" \
    --label "traefik.http.routers.ws.service=ws-service" \
    --label "traefik.http.routers.ws.rule=Host(\`ws.freshair.radio\`)" \
    --label "com.centurylinklabs.watchtower.enable=true" \
    --env-file $PWD/env/ctrl-backend.env \
    ghcr.io/freshairradio/ctrl-backend:latest

