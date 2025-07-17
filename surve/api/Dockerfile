FROM php:8.2-apache
RUN docker-php-ext-install mysqli pdo pdo_mysql && \
    mkdir /var/www/html/error_log && \
    chmod 777 /var/www/html/error_log
COPY . /var/www/html/