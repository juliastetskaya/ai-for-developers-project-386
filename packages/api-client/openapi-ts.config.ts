import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../typespec/tsp-output/@typespec/openapi3/openapi.yaml',
  output: 'src/client',
});
