.PHONY: dev dev-frontend
.PHONY: build test lint clean install
.PHONY: pipeline pipeline-districts

# Python module: wv_tax_cut (West Virginia SB 392 income tax cut)

# Port selection helper - finds the first available port in 4000-4100
define find_port
$(shell python -c "import socket, sys; \
[sys.exit(0) or print(p) for p in range(4000, 4101) \
if not (lambda s: s.bind(('', p)) or s.close())(socket.socket())] \
if 0 else (print('ERROR: no free port in 4000-4100', file=sys.stderr), sys.exit(1))" 2>nul || \
python -c "import socket; s=socket.socket(); s.bind(('',4000)); s.close(); print(4000)" 2>nul || echo 4000)
endef

# Install dependencies
install:
	cd frontend && npm install

# Start development server (frontend only for hybrid-precomputed-api pattern)
dev: dev-frontend

# Frontend only
dev-frontend:
	@cd frontend && set PORT=$(find_port) && npm run dev

build:
	cd frontend && npm run build

test:
	cd frontend && npm run test

lint:
	cd frontend && npm run lint

clean:
	cd frontend && if exist .next rmdir /s /q .next
	cd frontend && if exist node_modules rmdir /s /q node_modules

# Regenerate aggregate data from the local microsimulation helper
pipeline:
	python scripts/pipeline.py

# Regenerate placeholder West Virginia congressional-district CSV
pipeline-districts:
	python scripts/generate_district_csv.py
