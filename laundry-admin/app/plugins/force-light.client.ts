export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()

  colorMode.preference = 'light'
  colorMode.value = 'light'
})
