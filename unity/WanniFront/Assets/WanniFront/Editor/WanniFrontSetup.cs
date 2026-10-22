using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace WanniFront.EditorTools
{
    /// <summary>Import settings for the Blender-exported models and textures.</summary>
    public class WanniFrontImport : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (!assetPath.Contains("WanniFront/Resources/Models")) return;
            var mi = (ModelImporter)assetImporter;
            mi.isReadable = true; // needed for runtime MeshColliders
            mi.importCameras = false;
            mi.importLights = false;
            mi.importAnimation = false;
            mi.animationType = ModelImporterAnimationType.None;
            mi.useFileScale = true;
        }

        void OnPreprocessTexture()
        {
            if (!assetPath.Contains("WanniFront/Resources/Textures")) return;
            var ti = (TextureImporter)assetImporter;
            string name = Path.GetFileNameWithoutExtension(assetPath);
            ti.maxTextureSize = 1024;
            ti.anisoLevel = 4;
            ti.mipmapEnabled = true;
            if (name.EndsWith("_n")) ti.textureType = TextureImporterType.NormalMap;
            if (name == "grass_blade")
            {
                ti.alphaIsTransparency = true;
                ti.wrapMode = TextureWrapMode.Clamp;
            }
        }
    }

    /// <summary>One-time project setup: linear colour, layers, shaders and the game scene.</summary>
    [InitializeOnLoad]
    public static class WanniFrontSetup
    {
        const string Marker = "ProjectSettings/WanniFrontSetup.done";
        const string ScenePath = "Assets/WanniFront/WanniFront.unity";

        static WanniFrontSetup()
        {
            if (!File.Exists(Marker)) EditorApplication.delayCall += Run;
        }

        [MenuItem("Wanni Front/Run Project Setup")]
        public static void Run()
        {
            PlayerSettings.colorSpace = ColorSpace.Linear;
            NameLayers();
            IncludeShaders("Standard", "Skybox/Procedural", "Legacy Shaders/Particles/Additive",
                "Legacy Shaders/Particles/Alpha Blended", "Particles/Standard Unlit", "Sprites/Default",
                "Hidden/TerrainEngine/Details/BillboardWavingDoublePass", "Hidden/TerrainEngine/Details/WavingDoublePass",
                "Nature/Terrain/Standard");
            ReimportModels();
            CreateScene();
            File.WriteAllText(Marker, "Wanni Front setup complete\n");
            Debug.Log("Wanni Front: project set up. Open " + ScenePath + " and press Play.");
        }

        [MenuItem("Wanni Front/Reimport Blender Models")]
        public static void ReimportModels()
        {
            AssetDatabase.ImportAsset("Assets/WanniFront/Resources", ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate);
        }

        static void NameLayers()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var layers = so.FindProperty("layers");
            if (layers == null) return;
            if (string.IsNullOrEmpty(layers.GetArrayElementAtIndex(30).stringValue)) layers.GetArrayElementAtIndex(30).stringValue = "Units";
            if (string.IsNullOrEmpty(layers.GetArrayElementAtIndex(31).stringValue)) layers.GetArrayElementAtIndex(31).stringValue = "ViewModel";
            so.ApplyModifiedProperties();
        }

        static void IncludeShaders(params string[] names)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var list = so.FindProperty("m_AlwaysIncludedShaders");
            if (list == null) return;
            foreach (var n in names)
            {
                var sh = Shader.Find(n);
                if (sh == null) continue;
                bool present = false;
                for (int i = 0; i < list.arraySize; i++)
                    if (list.GetArrayElementAtIndex(i).objectReferenceValue == sh) present = true;
                if (present) continue;
                list.InsertArrayElementAtIndex(list.arraySize);
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = sh;
            }
            so.ApplyModifiedProperties();
        }

        static void CreateScene()
        {
            if (!File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            else EditorSceneManager.OpenScene(ScenePath);
            var scenes = EditorBuildSettings.scenes;
            foreach (var s in scenes) if (s.path == ScenePath) return;
            var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(scenes) { new EditorBuildSettingsScene(ScenePath, true) };
            EditorBuildSettings.scenes = list.ToArray();
        }
    }
}
