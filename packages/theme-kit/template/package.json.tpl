{
  "name": "{{name}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wb-theme dev",
    "build": "wb-theme build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wirebound/theme-sdk": "file:vendor/{{sdkTarball}}"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@wirebound/theme-kit": "file:vendor/{{kitTarball}}",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
