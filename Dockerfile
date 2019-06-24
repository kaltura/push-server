FROM node:10

# Set the working directory at the container for the image
WORKDIR /opt/kaltura/push-server

# add the relevent files to the image
ADD . ./

# Build arguments (changed while actually building an image - from jenkins)
ARG VERSION

# parameters for image
ENV VERSION ${VERSION}
ENV APP_VERSION ${APP_VERSION}
ENV TCM_APP push-server-${APP_VERSION}

ENV SOCKET_PORT 80
ENV DEMO_PORT 8080

ARG LOG_PATH=/var/log/push-server
ENV LOG_PATH ${LOG_PATH}
RUN mkdir ${LOG_PATH}

# Install any needed packages (Machine Prerequisites)
RUN npm install

# output parameters (that jenkins use)
LABEL version=${VERSION}

EXPOSE 80
EXPOSE 8080

CMD npm start