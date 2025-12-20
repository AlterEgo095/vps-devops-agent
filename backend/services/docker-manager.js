import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Docker Manager Service
 * Gestion complète des conteneurs, images et réseaux Docker
 */
class DockerManager {
  constructor() {
    // Initialiser le client Docker
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Lister tous les conteneurs (actifs et arrêtés)
   */
  async listContainers(all = true) {
    try {
      const containers = await this.docker.listContainers({ all });
      
      return containers.map(container => ({
        id: container.Id,
        name: container.Names[0].replace('/', ''),
        image: container.Image,
        state: container.State,
        status: container.Status,
        ports: container.Ports.map(p => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type
        })),
        created: new Date(container.Created * 1000).toISOString()
      }));
    } catch (error) {
      throw new Error(`Failed to list containers: ${error.message}`);
    }
  }

  /**
   * Obtenir les détails d'un conteneur
   */
  async getContainerDetails(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      
      return {
        id: info.Id,
        name: info.Name.replace('/', ''),
        image: info.Config.Image,
        state: info.State,
        created: info.Created,
        config: info.Config,
        hostConfig: info.HostConfig,
        networkSettings: info.NetworkSettings,
        mounts: info.Mounts
      };
    } catch (error) {
      throw new Error(`Failed to get container details: ${error.message}`);
    }
  }

  /**
   * Obtenir les statistiques en temps réel d'un conteneur
   */
  async getContainerStats(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      
      // Calculer les pourcentages CPU et Mémoire
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
      
      const memoryUsage = stats.memory_stats.usage;
      const memoryLimit = stats.memory_stats.limit;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;
      
      return {
        cpu: {
          percent: cpuPercent.toFixed(2),
          usage: stats.cpu_stats.cpu_usage.total_usage
        },
        memory: {
          usage: memoryUsage,
          limit: memoryLimit,
          percent: memoryPercent.toFixed(2),
          usageMB: (memoryUsage / 1024 / 1024).toFixed(2),
          limitMB: (memoryLimit / 1024 / 1024).toFixed(2)
        },
        network: stats.networks,
        blockIO: stats.blkio_stats
      };
    } catch (error) {
      throw new Error(`Failed to get container stats: ${error.message}`);
    }
  }

  /**
   * Créer un nouveau conteneur
   */
  async createContainer(options) {
    try {
      const {
        name,
        image,
        ports = {},
        environment = {},
        volumes = [],
        restartPolicy = 'unless-stopped',
        command,
        workingDir
      } = options;

      // Construire la configuration du conteneur
      const createOptions = {
        name,
        Image: image,
        Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
        ExposedPorts: {},
        HostConfig: {
          PortBindings: {},
          Binds: volumes,
          RestartPolicy: {
            Name: restartPolicy
          }
        }
      };

      // Configurer les ports
      for (const [containerPort, hostPort] of Object.entries(ports)) {
        const portKey = `${containerPort}/tcp`;
        createOptions.ExposedPorts[portKey] = {};
        createOptions.HostConfig.PortBindings[portKey] = [{
          HostPort: String(hostPort)
        }];
      }

      if (command) {
        createOptions.Cmd = Array.isArray(command) ? command : command.split(' ');
      }

      if (workingDir) {
        createOptions.WorkingDir = workingDir;
      }

      // Vérifier si l'image existe, sinon la télécharger
      await this.pullImage(image);

      // Créer le conteneur
      const container = await this.docker.createContainer(createOptions);
      
      return {
        id: container.id,
        name,
        status: 'created'
      };
    } catch (error) {
      throw new Error(`Failed to create container: ${error.message}`);
    }
  }

  /**
   * Démarrer un conteneur
   */
  async startContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
      return { success: true, status: 'started' };
    } catch (error) {
      throw new Error(`Failed to start container: ${error.message}`);
    }
  }

  /**
   * Arrêter un conteneur
   */
  async stopContainer(containerId, timeout = 10) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });
      return { success: true, status: 'stopped' };
    } catch (error) {
      throw new Error(`Failed to stop container: ${error.message}`);
    }
  }

  /**
   * Redémarrer un conteneur
   */
  async restartContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.restart();
      return { success: true, status: 'restarted' };
    } catch (error) {
      throw new Error(`Failed to restart container: ${error.message}`);
    }
  }

  /**
   * Supprimer un conteneur
   */
  async removeContainer(containerId, force = false) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force });
      return { success: true, status: 'removed' };
    } catch (error) {
      throw new Error(`Failed to remove container: ${error.message}`);
    }
  }

  /**
   * Obtenir les logs d'un conteneur
   */
  async getContainerLogs(containerId, tail = 100) {
    try {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });
      
      return logs.toString('utf8');
    } catch (error) {
      throw new Error(`Failed to get container logs: ${error.message}`);
    }
  }

  /**
   * Lister toutes les images Docker
   */
  async listImages() {
    try {
      const images = await this.docker.listImages();
      
      return images.map(image => ({
        id: image.Id,
        tags: image.RepoTags || ['<none>'],
        size: image.Size,
        sizeMB: (image.Size / 1024 / 1024).toFixed(2),
        created: new Date(image.Created * 1000).toISOString()
      }));
    } catch (error) {
      throw new Error(`Failed to list images: ${error.message}`);
    }
  }

  /**
   * Télécharger une image Docker
   */
  async pullImage(imageName) {
    try {
      return new Promise((resolve, reject) => {
        this.docker.pull(imageName, (err, stream) => {
          if (err) return reject(err);
          
          this.docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          });
        });
      });
    } catch (error) {
      throw new Error(`Failed to pull image: ${error.message}`);
    }
  }

  /**
   * Supprimer une image Docker
   */
  async removeImage(imageId, force = false) {
    try {
      const image = this.docker.getImage(imageId);
      await image.remove({ force });
      return { success: true, status: 'removed' };
    } catch (error) {
      throw new Error(`Failed to remove image: ${error.message}`);
    }
  }

  /**
   * Générer un Dockerfile intelligent basé sur le type de projet
   */
  generateDockerfile(projectType, options = {}) {
    const dockerfiles = {
      nodejs: `FROM node:${options.nodeVersion || '20'}-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE ${options.port || 3000}

CMD ["npm", "start"]`,

      python: `FROM python:${options.pythonVersion || '3.11'}-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${options.port || 8000}

CMD ["python", "app.py"]`,

      php: `FROM php:${options.phpVersion || '8.2'}-apache

COPY . /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80`,

      nginx: `FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html

EXPOSE 80`
    };

    return dockerfiles[projectType] || dockerfiles.nodejs;
  }

  /**
   * Générer un docker-compose.yml
   */
  generateDockerCompose(projectName, services = []) {
    let compose = `version: '3.8'

services:\n`;

    services.forEach(service => {
      compose += `  ${service.name}:
    image: ${service.image}
    container_name: ${projectName}_${service.name}
    restart: unless-stopped`;

      if (service.ports) {
        compose += `
    ports:`;
        Object.entries(service.ports).forEach(([container, host]) => {
          compose += `
      - "${host}:${container}"`;
        });
      }

      if (service.environment) {
        compose += `
    environment:`;
        Object.entries(service.environment).forEach(([key, value]) => {
          compose += `
      - ${key}=${value}`;
        });
      }

      if (service.volumes) {
        compose += `
    volumes:`;
        service.volumes.forEach(volume => {
          compose += `
      - ${volume}`;
        });
      }

      compose += `\n\n`;
    });

    return compose;
  }
}

export default new DockerManager();
