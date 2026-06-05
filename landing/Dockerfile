FROM nginx:alpine
# Static marketing/product page. This same page is also served by the signaling
# relay at oss.naridon.com (kept in sync via the root `npm run build:site`).
COPY index.html /usr/share/nginx/html/index.html
COPY stats.html /usr/share/nginx/html/stats.html
# First-party analytics beacon (privacy-respecting; see analytics.js). On this
# static host it posts cross-origin to the relay — set window.__ANALYTICS_ENDPOINT.
COPY *.js /usr/share/nginx/html/
# Hero + product-tour screenshots (screenshot-app.png, shot-*.png) and the
# animated pan/zoom bands (motion-*.webp).
COPY *.png /usr/share/nginx/html/
COPY *.webp /usr/share/nginx/html/
COPY *.svg /usr/share/nginx/html/
EXPOSE 80
