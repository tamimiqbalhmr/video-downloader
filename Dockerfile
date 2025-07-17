FROM python:alpine3.22 AS base

LABEL maintainer="Tamim Iqbal"

COPY requirements.txt requirements.txt

RUN pip install -r requirements.txt

FROM python:alpine3.22 AS final

WORKDIR /app

COPY --from=base /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages

COPY --from=base /usr/local/bin /usr/local/bin

COPY . /app

EXPOSE 5000

CMD ["python", "app.py"]


