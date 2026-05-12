FROM grafana/grafana:10.4.3
ENV GF_SECURITY_ADMIN_PASSWORD=admin
ENV GF_USERS_ALLOW_SIGN_UP=false
ENV GF_AUTH_ANONYMOUS_ENABLED=true
ENV GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
COPY monitoring/grafana/provisioning /etc/grafana/provisioning
COPY monitoring/grafana/dashboards /etc/grafana/dashboards
