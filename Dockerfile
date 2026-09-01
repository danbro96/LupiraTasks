# Single-image BFF: build the Vite SPA, then publish the .NET app with the SPA served from wwwroot.
# Build context = repo root.

# --- SPA build ---
FROM node:24-alpine AS client
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
# Every workspace's manifest — npm ci validates the lockfile against all of them.
COPY src/LupiraTasksWeb.Client/package.json src/LupiraTasksWeb.Client/
COPY packages/domain/package.json packages/domain/
COPY packages/tokens/package.json packages/tokens/
COPY apps/mobile/package.json apps/mobile/
RUN npm i -g npm@12
# Web workspaces only — the mobile app's Expo tree has no business in this image.
RUN npm ci -w src/LupiraTasksWeb.Client -w packages/domain -w packages/tokens --include-workspace-root
COPY packages/domain/ packages/domain/
COPY packages/tokens/ packages/tokens/
COPY src/LupiraTasksWeb.Client/ src/LupiraTasksWeb.Client/
RUN npm run build -w src/LupiraTasksWeb.Client -- --outDir dist --emptyOutDir

# --- backend publish ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/LupiraTasksWeb/ ./LupiraTasksWeb/
WORKDIR /src/LupiraTasksWeb
ARG BUILD_CONFIGURATION=Release
RUN dotnet restore "./LupiraTasksWeb.csproj"
RUN dotnet publish "./LupiraTasksWeb.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false
COPY --from=client /repo/src/LupiraTasksWeb.Client/dist /app/publish/wwwroot

# --- runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Data-protection key ring — mount a volume here so the auth cookie survives container restarts.
RUN mkdir -p /keys && chown app:app /keys

ENV ASPNETCORE_URLS=http://+:80
COPY --from=build /app/publish .
USER app

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/livez || exit 1
ENTRYPOINT ["dotnet", "LupiraTasksWeb.dll"]
