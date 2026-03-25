import { Project } from "@shared/types";

const STORAGE_KEY = "threads_studio_projects";

export function getAllProjects(): Project[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load projects:", error);
    return [];
  }
}

export function getProjectById(id: string): Project | undefined {
  const projects = getAllProjects();
  return projects.find((p) => p.id === id);
}

export function saveProject(project: Project): void {
  try {
    const projects = getAllProjects();
    const index = projects.findIndex((p) => p.id === project.id);
    
    if (index >= 0) {
      projects[index] = { ...project, updatedAt: Date.now() };
    } else {
      projects.push(project);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error("Failed to save project:", error);
    throw new Error("プロジェクトの保存に失敗しました");
  }
}

export function deleteProject(id: string): void {
  try {
    const projects = getAllProjects();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete project:", error);
    throw new Error("プロジェクトの削除に失敗しました");
  }
}

export function searchProjects(query: string): Project[] {
  const projects = getAllProjects();
  const lowerQuery = query.toLowerCase();
  
  return projects.filter((p) => {
    return (
      p.title.toLowerCase().includes(lowerQuery) ||
      p.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
      p.posts.some((post) => post.content.toLowerCase().includes(lowerQuery))
    );
  });
}

export function sortProjects(
  projects: Project[],
  sortBy: "createdAt" | "updatedAt" | "title"
): Project[] {
  return [...projects].sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title, "ja");
    }
    return b[sortBy] - a[sortBy];
  });
}
