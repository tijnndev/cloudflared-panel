package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/msquad/cloudflared-panel/internal/dockerclient"
	"github.com/msquad/cloudflared-panel/internal/handlers"
	"github.com/msquad/cloudflared-panel/internal/middleware"
	"github.com/msquad/cloudflared-panel/internal/settings"
)

func main() {
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/data"
	}

	store := settings.NewStore(dataDir)
	if err := store.Load(); err != nil {
		log.Fatalf("load settings: %v", err)
	}

	docker, err := dockerclient.New()
	if err != nil {
		log.Printf("docker client unavailable: %v", err)
	}

	h := handlers.New(store, docker)

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "X-API-Key"},
	}))

	api := r.Group("/api")
	api.GET("/auth/status", h.GetAuthStatus)
	api.Use(middleware.APIKeyAuth())
	{
		api.GET("/overview", h.GetOverview)
		api.GET("/tunnel/details", h.GetTunnelDetails)
		api.POST("/routes", h.AddRoute)
		api.DELETE("/routes/:hostname", h.DeleteRoute)
		api.POST("/routes/dns", h.RouteDNS)
		api.POST("/cloudflared/reload", h.ReloadCloudflared)

		api.GET("/settings", h.GetSettings)
		api.PUT("/settings", h.UpdateSettings)

		api.GET("/home/users", h.ListHomeUsers)
		api.GET("/home/:username/browse", h.BrowseHome)
		api.GET("/compose/scan", h.ScanCompose)
		api.GET("/compose/projects", h.GetComposeProjects)
		api.POST("/compose/action", h.ComposeAction)
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = filepath.Join(".", "static")
	}

	if info, err := os.Stat(staticDir); err == nil && info.IsDir() {
		r.Static("/assets", filepath.Join(staticDir, "assets"))
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(staticDir, "index.html"))
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	log.Printf("cloudflared-panel listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
