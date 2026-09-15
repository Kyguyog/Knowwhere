gcloud app deploy app.yaml --quiet && \
gcloud app versions delete $(gcloud app versions list --format="value(version.id)" --sort-by="~version.createTime" | tail -n +2) --quiet