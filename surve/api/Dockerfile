FROM php:8.2-apache
RUN docker-php-ext-install mysqli pdo pdo_mysql && \
    mkdir /var/www/html/error_log && \
    chmod 777 /var/www/html/error_log
COPY . /var/www/html/
CMD ["apache2-foreground"]
EXPOSE 80
# This Dockerfile sets up a PHP environment with Apache, installs necessary extensions, and copies the  application code into the container.
# It also ensures that the error log directory is writable, allowing for proper logging of errors during    
