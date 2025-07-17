FROM python:3.9-slim

LABEL maintainer="Tamim Iqbal"

WORKDIR /app

COPY . /app/

COPY requirements.txt /app/requirements.txt

RUN pip install -r requirements.txt

EXPOSE 5000

CMD ["python", "app.py"]




