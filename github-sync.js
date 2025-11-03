// GitHub Sync System for Vehicle Presets
class GitHubSync {
  constructor(config) {
    this.config = config;
    if (!this.config.TOKEN || !this.config.OWNER || !this.config.REPO) {
      console.warn('GitHub sync not configured');
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.apiUrl = `https://api.github.com/repos/${this.config.OWNER}/${this.config.REPO}/contents/${this.config.PRESETS_FOLDER}`;
    console.log('✓ GitHub Sync initialized');
  }

  async saveVehicleToGitHub(vehicle) {
    if (!this.enabled) return false;
    
    try {
      const fileName = `${vehicle.id}.json`;
      const filePath = `${this.config.PRESETS_FOLDER}/${fileName}`;
      const fileUrl = `https://api.github.com/repos/${this.config.OWNER}/${this.config.REPO}/contents/${filePath}`;

      let sha = null;
      try {
        const getResponse = await fetch(fileUrl, {
          headers: {
            'Authorization': `token ${this.config.TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (getResponse.ok) {
          const existing = await getResponse.json();
          sha = existing.sha;
        }
      } catch (e) {
        console.log('Creating new vehicle file');
      }

      const content = btoa(unescape(encodeURIComponent(JSON.stringify(vehicle, null, 2))));
      
      const payload = {
        message: `Update vehicle: ${vehicle.name}`,
        content: content,
        branch: this.config.BRANCH
      };

      if (sha) payload.sha = sha;

      const response = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.config.TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `API error: ${response.status}`);
      }

      console.log('✓ Saved to GitHub:', vehicle.name);
      return true;
    } catch (error) {
      console.error('GitHub save error:', error);
      return false;
    }
  }

  async loadVehiclesFromGitHub() {
    if (!this.enabled) return [];
    
    try {
      const response = await fetch(this.apiUrl, {
        headers: {
          'Authorization': `token ${this.config.TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) return [];

      const files = await response.json();
      const vehicles = [];

      for (const file of files) {
        if (file.name.endsWith('.json') && file.type === 'file') {
          try {
            const fileResponse = await fetch(file.download_url);
            const vehicle = await fileResponse.json();
            vehicles.push(vehicle);
          } catch (e) {
            console.error('Error loading:', file.name);
          }
        }
      }

      return vehicles;
    } catch (error) {
      console.error('GitHub load error:', error);
      return [];
    }
  }

  async deleteVehicleFromGitHub(vehicleId) {
    if (!this.enabled) return false;
    
    try {
      const fileName = `${vehicleId}.json`;
      const fileUrl = `https://api.github.com/repos/${this.config.OWNER}/${this.config.REPO}/contents/${this.config.PRESETS_FOLDER}/${fileName}`;

      const getResponse = await fetch(fileUrl, {
        headers: {
          'Authorization': `token ${this.config.TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!getResponse.ok) return false;

      const fileData = await getResponse.json();

      const deleteResponse = await fetch(fileUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${this.config.TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Delete vehicle: ${vehicleId}`,
          sha: fileData.sha,
          branch: this.config.BRANCH
        })
      });

      return deleteResponse.ok;
    } catch (error) {
      console.error('GitHub delete error:', error);
      return false;
    }
  }
}

// Initialize GitHub Sync
let gitHubSync = null;
if (typeof GITHUB_CONFIG !== 'undefined') {
  gitHubSync = new GitHubSync(GITHUB_CONFIG);
}

// Load GitHub presets on startup
async function loadGitHubPresetsOnLoad() {
  if (!gitHubSync || !gitHubSync.enabled) {
    console.log('GitHub sync not configured');
    return;
  }
  
  console.log('Loading vehicles from GitHub...');
  const gitHubVehicles = await gitHubSync.loadVehiclesFromGitHub();
  
  if (gitHubVehicles.length > 0) {
    let localVehicles = JSON.parse(localStorage.getItem('gazelle_sim_vehicles')) || [];
    
    for (const gh of gitHubVehicles) {
      if (!localVehicles.find(v => v.id === gh.id)) {
        localVehicles.push(gh);
      }
    }
    
    localStorage.setItem('gazelle_sim_vehicles', JSON.stringify(localVehicles));
    console.log('✓ GitHub vehicles loaded:', gitHubVehicles.length);
    if (typeof updateVehicleListUI === 'function') {
      updateVehicleListUI();
    }
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadGitHubPresetsOnLoad, 1000);
});
