import './style.css';

window.addEventListener('DOMContentLoaded', () => {
  window.SwaggerUIBundle({
    url: '/docs/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    filter: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 0,
    displayRequestDuration: true,
    withCredentials: true,
    validatorUrl: null,
  });
});
