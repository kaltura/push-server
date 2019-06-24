
### Build docker
	```    
	docker build -t kaltura/push-server --build-arg VERSION=1.0.0 --build-arg APP_VERSION=1_0_0 .
	```
### Run docker
	```
	docker run --rm -it -p 80:80 kaltura/push-server
	```

	Supported environment variables:
	 - VERSION (default defined during build, e.g. 1.0.0)
	 - TCM_URL (default is http://tcm:8080)
	 - TCM_APP (default is push-server-${APP_VERSION}, e.g. push-server-1.0.0)
	 - TCM_SECTION (default is config)
	 - TCM_APP_ID (default is 5bf8cf60)
	 - TCM_APP_SECRET (default is 5aaa99331c18f6bad4adeef93ab770c2)

### Run docker with demo application
	```
	docker run --rm -it -p 80:80 -p 8080:8080 kaltura/push-server
	```