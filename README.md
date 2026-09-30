Steps for the collaborator 

1. Install Node.js 20+ (LTS). Check with node -v → should be v20 or newer.

2. Get the code and enter the folder.
cd Atlas-client
(if from git: git clone <repo-url> first, then cd Atlas-client)

3. Install dependencies.
npm install

4. Point the client at your backend. In the Atlas-client root folder, create a file named .env with one line — the URL 

VITE_API_BASE_URL=http://192.168.2.43:5000/api



5. Start the dev server.
npm run dev
Vite prints a local URL — usually http://localhost:5173/ (it picks the next free port if busy). That runs on their machine.

6. Open a real floor. The home page is intentionally blank; go straight to a floor URL, e.g.:

Phoenix and August are our current floor with rendered map 
Update local port number as per local system

August:-http://localhost:5173/visit/a4bd1e50-8935-4e9c-8a93-c107529355bb/36de4ed1-42b3-46ce-a9bb-ce3e8a8ec89a.

Phoenix:- http://localhost:5173/visit/2f5081d6-bcc4-4ff1-88dc-937d06423aa4/def69137-e452-4f7a-8c92-52f053ce6200
then tap 3D.


